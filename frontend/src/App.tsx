import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkCreateEmployees,
  createModuleRegistrations,
  createEmployee,
  deleteEmployee as apiDeleteEmployee,
  fetchEmployees,
  fetchModuleRegistrations,
  fetchSettings,
  fetchSubmissionBundlePdf,
  fetchSubmissionPdf,
  fetchSubmissions,
  fetchTemplate,
  fetchTemplates,
  loginAdmin,
  loginTrainer,
  openSubmissionOutlookDraft,
  sendSubmissionBatch,
  submitTraining,
  updateSettings,
  updateTrainerProfile,
  updateEmployee as apiUpdateEmployee,
  updateTemplateSection
} from "./api/client";
import { AppSidebar, type AppView } from "./components/AppSidebar";
import { Dashboard } from "./components/Dashboard";
import { DeliveryWorkspace } from "./components/DeliveryWorkspace";
import { EmployeeManager } from "./components/EmployeeManager";
import { LanguageToggle } from "./components/LanguageToggle";
import { ProgramInfo } from "./components/ProgramInfo";
import { RegistrationWorkspace } from "./components/RegistrationWorkspace";
import { SessionPanel } from "./components/SessionPanel";
import { TemplateCatalog } from "./components/TemplateCatalog";
import { ThemeToggle } from "./components/ThemeToggle";
import { useLanguage } from "./features/language/LanguageProvider";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { dedupeTemplatesByModule, getModuleKey } from "./utils/moduleIdentity";
import { createAutoSignatureDataUrl } from "./utils/signature";
import type {
  AdminSession,
  AppSettings,
  EmployeeProfile,
  EmployeeRole,
  EmployeeTeam,
  ModuleRegistrationListItem,
  SectionReview,
  SubmissionListItem,
  SubmissionSendStatus,
  TrainerSession,
  TrainingTemplate,
  TrainingTemplateSummary
} from "./types/training";

const emptySettings: AppSettings = {
  defaultPrimaryRecipient: "",
  defaultCcMe: "",
  deliveryRecipients: [],
  deliveryEmailSubjectTemplate: "",
  deliveryEmailBodyTemplate: "",
  smtpConfigured: false
};

const selectedEmployeeStorageKey = "ojt.selectedEmployeeId";
const selectedTemplateStorageKey = "ojt.selectedTemplateId";
const allTeams: EmployeeTeam[] = ["C-OPS", "F-OPS"];

const validViews: AppView[] = ["dashboard", "info", "employees", "documents", "training", "delivery"];
const publicViews: AppView[] = ["info"];

function getViewFromPath(): AppView {
  const path = window.location.pathname.replace(/^\//, "");
  return validViews.includes(path as AppView) ? (path as AppView) : "dashboard";
}

function startBrowserDownload(blob: Blob, fileName: string): void {
  const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
  const downloadUrl = URL.createObjectURL(downloadBlob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);
}

function buildUniqueEmails(values: string[]): string[] {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function buildCompletedReviews(template: TrainingTemplate): SectionReview[] {
  return template.sections.map((section) => ({
    sectionId: section.id,
    acknowledged: true,
    note: ""
  }));
}

type DeliveryActionResult = {
  count: number;
  emailDelivered: boolean;
  emailMessage: string;
  sendStatus: SubmissionSendStatus;
};

export default function App() {
  const { locale, messages } = useLanguage();
  const [currentView, setCurrentView] = useState<AppView>(getViewFromPath);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [templates, setTemplates] = useState<TrainingTemplateSummary[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<SubmissionListItem[]>([]);
  const [moduleRegistrations, setModuleRegistrations] = useState<ModuleRegistrationListItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [activeAdmin, setActiveAdmin] = useLocalStorageState<AdminSession | null>("ojt.activeAdmin", null);
  const [activeTrainer, setActiveTrainer] = useLocalStorageState<TrainerSession | null>("ojt.activeTrainer", null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => window.localStorage.getItem(selectedEmployeeStorageKey) ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => window.localStorage.getItem(selectedTemplateStorageKey) ?? "");
  const [selectedTemplate, setSelectedTemplate] = useState<TrainingTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [lastResult, setLastResult] = useState<DeliveryActionResult | null>(null);
  const [adminAuthBusy, setAdminAuthBusy] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [trainerAuthBusy, setTrainerAuthBusy] = useState(false);
  const [trainerProfileBusy, setTrainerProfileBusy] = useState(false);
  const [trainerAuthError, setTrainerAuthError] = useState<string | null>(null);
  const [trainerProfileMessage, setTrainerProfileMessage] = useState<string | null>(null);
  const [adminSettingsBusy, setAdminSettingsBusy] = useState(false);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);
  const [adminSettingsMessage, setAdminSettingsMessage] = useState<string | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
  const [registrationModalOpen, setRegistrationModalOpen] = useState(false);
  const [registrationConfirmMessage, setRegistrationConfirmMessage] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    trainerName: "",
    trainerEmail: "",
    primaryRecipient: ""
  });

  const activeTrainerTeam = activeTrainer?.team === "C-OPS" || activeTrainer?.team === "F-OPS"
    ? activeTrainer.team
    : null;
  const hasAdminAccess = Boolean(activeAdmin);
  const hasTrainerAccess = Boolean(activeTrainer && !activeTrainer.mustChangePin);
  const hasPrivilegedAccess = hasAdminAccess || hasTrainerAccess;
  const defaultView: AppView = hasPrivilegedAccess ? "dashboard" : "info";
  const effectiveView: AppView = hasPrivilegedAccess ? currentView : "info";
  const trainerScopeTeam = hasTrainerAccess ? activeTrainerTeam : null;
  const visibleTeams = useMemo<EmployeeTeam[]>(() => trainerScopeTeam ? [trainerScopeTeam] : allTeams, [trainerScopeTeam]);
  const visibleViews = useMemo(() => hasPrivilegedAccess ? validViews : publicViews, [hasPrivilegedAccess]);
  const trainerOptions = useMemo(() => employees
    .filter((employee) => employee.role === "trainer")
    .map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      team: employee.team,
      hasPin: employee.hasPin
    })), [employees]);
  const scopedEmployees = useMemo(() => trainerScopeTeam
    ? employees.filter((employee) => employee.team === trainerScopeTeam)
    : employees, [employees, trainerScopeTeam]);
  const scopedTemplates = useMemo(() => trainerScopeTeam
    ? templates.filter((template) => template.team === trainerScopeTeam)
    : templates, [templates, trainerScopeTeam]);
  const scopedEmployeeIds = useMemo(() => new Set(scopedEmployees.map((employee) => employee.id)), [scopedEmployees]);
  const scopedSubmissions = useMemo(() => trainerScopeTeam
    ? allSubmissions.filter((submission) => scopedEmployeeIds.has(submission.employeeId))
    : allSubmissions, [allSubmissions, scopedEmployeeIds, trainerScopeTeam]);
  const selectedEmployee = useMemo(() => scopedEmployees.find((employee) => employee.id === selectedEmployeeId), [scopedEmployees, selectedEmployeeId]);
  const deliveryTemplates = useMemo(() => {
    const preferredLanguage = locale === "de" ? "German" : "English";
    if (!selectedEmployee) {
      return dedupeTemplatesByModule(scopedTemplates, preferredLanguage);
    }

    return dedupeTemplatesByModule(
      scopedTemplates.filter((template) => template.team === selectedEmployee.team),
      preferredLanguage
    );
  }, [locale, scopedTemplates, selectedEmployee]);
  const selectedTemplateSummary = useMemo(() => deliveryTemplates.find((template) => template.id === selectedTemplateId) ?? null, [deliveryTemplates, selectedTemplateId]);
  const submissions = useMemo(() => {
    if (!selectedEmployeeId) {
      return [];
    }

    return scopedSubmissions
      .filter((submission) => submission.employeeId === selectedEmployeeId)
      .sort((left, right) => new Date(right.sentAt ?? right.createdAt).getTime() - new Date(left.sentAt ?? left.createdAt).getTime());
  }, [scopedSubmissions, selectedEmployeeId]);

  const navigate = useCallback((view: AppView) => {
    window.history.pushState(null, "", `/${view}`);
    setCurrentView(view);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  useEffect(() => {
    function onPopState() {
      setCurrentView(getViewFromPath());
    }
    window.addEventListener("popstate", onPopState);
    if (window.location.pathname === "/") window.history.replaceState(null, "", "/dashboard");
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (activeAdmin && activeTrainer) {
      setActiveAdmin(null);
    }
  }, [activeAdmin, activeTrainer, setActiveAdmin]);

  useEffect(() => {
    if (activeTrainer && !activeTrainerTeam) {
      setActiveTrainer(null);
      setTrainerProfileMessage(null);
    }
  }, [activeTrainer, activeTrainerTeam, setActiveTrainer]);

  useEffect(() => {
    if (visibleViews.includes(currentView)) {
      return;
    }

    window.history.replaceState(null, "", `/${defaultView}`);
    setCurrentView(defaultView);
  }, [currentView, defaultView, visibleViews]);

  useEffect(() => {
    if (hasPrivilegedAccess) {
      return;
    }

    setSelectedEmployeeId("");
    setSelectedTemplateId("");
    setSelectedTemplate(null);
  }, [hasPrivilegedAccess]);

  useEffect(() => {
    if (selectedEmployeeId) {
      window.localStorage.setItem(selectedEmployeeStorageKey, selectedEmployeeId);
      return;
    }

    window.localStorage.removeItem(selectedEmployeeStorageKey);
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (selectedTemplateId) {
      window.localStorage.setItem(selectedTemplateStorageKey, selectedTemplateId);
      return;
    }

    window.localStorage.removeItem(selectedTemplateStorageKey);
  }, [selectedTemplateId]);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        setLoading(true);
        setError(null);
        const [nextSettings, nextTemplates, nextEmployees, nextSubmissions] = await Promise.all([
          fetchSettings(),
          fetchTemplates(),
          fetchEmployees(),
          fetchSubmissions()
        ]);
        const nextRegistrations = await fetchModuleRegistrations();
        setSettings(nextSettings);
        setTemplates(nextTemplates);
        setEmployees(nextEmployees);
        setAllSubmissions(nextSubmissions);
        setModuleRegistrations(nextRegistrations);
        setDeliveryForm((current) => ({
          ...current,
          primaryRecipient: current.primaryRecipient || nextSettings.defaultPrimaryRecipient
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : messages.app.loadFailed);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [messages.app.loadFailed, retryCount]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      return;
    }

    if (!scopedTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplate(null);
      setSelectedTemplateId("");
      return;
    }

    void fetchTemplate(selectedTemplateId)
      .then(setSelectedTemplate)
      .catch(() => {
        setSelectedTemplate(null);
        setSelectedTemplateId("");
      });
  }, [scopedTemplates, selectedTemplateId]);

  useEffect(() => {
    if (selectedEmployeeId && !scopedEmployees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(scopedEmployees.find((employee) => employee.role === "employee")?.id ?? "");
    }
  }, [scopedEmployees, selectedEmployeeId]);

  useEffect(() => {
    if (selectedTemplateId && !deliveryTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId("");
      setSelectedTemplate(null);
    }
  }, [deliveryTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedEmployee || !selectedTemplateSummary) {
      return;
    }

    if (selectedTemplateSummary.team !== selectedEmployee.team) {
      setSelectedTemplateId("");
      setSelectedTemplate(null);
    }
  }, [selectedEmployee, selectedTemplateSummary]);

  useEffect(() => {
    if (!selectedEmployeeId || !selectedTemplateSummary) {
      return;
    }

    const selectedModuleTitle = getModuleKey(selectedTemplateSummary.title);
    const alreadyRecorded = allSubmissions.some((submission) => (
      submission.employeeId === selectedEmployeeId
      && getModuleKey(submission.templateTitle) === selectedModuleTitle
    ));

    if (alreadyRecorded) {
      setSelectedTemplateId("");
      setSelectedTemplate(null);
    }
  }, [allSubmissions, selectedEmployeeId, selectedTemplateSummary]);

  useEffect(() => {
    const nextTrainerName = activeTrainer?.name ?? activeAdmin?.name ?? "";
    const nextTrainerEmail = activeTrainer?.email ?? "";

    setDeliveryForm((current) => ({
      ...current,
      trainerName: nextTrainerName,
      trainerEmail: nextTrainerEmail
    }));
  }, [activeAdmin?.name, activeTrainer?.email, activeTrainer?.name]);

  useEffect(() => {
    setDeliveryForm((current) => ({
      ...current,
      primaryRecipient: settings.deliveryRecipients.includes(current.primaryRecipient)
        ? current.primaryRecipient
        : settings.defaultPrimaryRecipient
    }));
  }, [settings.defaultPrimaryRecipient, settings.deliveryRecipients]);

  async function handleAdminLogin(payload: { pin: string }): Promise<void> {
    try {
      setAdminAuthBusy(true);
      setAdminAuthError(null);
      setTrainerAuthError(null);
      const admin = await loginAdmin({ identifier: "admin", pin: payload.pin });
      setActiveTrainer(null);
      setTrainerProfileMessage(null);
      setActiveAdmin(admin);
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.admin.loginFailed;
      setAdminAuthError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setAdminAuthBusy(false);
    }
  }

  async function handleTrainerLogin(payload: { identifier: string; pin: string }): Promise<void> {
    try {
      setTrainerAuthBusy(true);
      setTrainerAuthError(null);
      setAdminAuthError(null);
      setTrainerProfileMessage(null);
      const trainer = await loginTrainer(payload);
      setActiveAdmin(null);
      setActiveTrainer(trainer);
      setTrainerProfileMessage(trainer.mustChangePin ? messages.auth.mustChangePinNotice : messages.auth.loginSuccess);
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.auth.loginFailed;
      setTrainerAuthError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setTrainerAuthBusy(false);
    }
  }

  async function handleTrainerProfileSave(payload: { pin?: string; signatureDataUrl?: string }): Promise<void> {
    if (!activeTrainer) {
      return;
    }

    try {
      setTrainerProfileBusy(true);
      setTrainerAuthError(null);
      const trainer = await updateTrainerProfile(activeTrainer.id, payload);
      setActiveTrainer(trainer);
      setTrainerProfileMessage(
        activeTrainer.mustChangePin && payload.pin
          ? messages.auth.mustChangePinSuccess
          : messages.auth.profileSaved
      );
    } catch (err) {
      setTrainerAuthError(err instanceof Error ? err.message : messages.auth.profileUpdateFailed);
    } finally {
      setTrainerProfileBusy(false);
    }
  }

  const handleTrainerLogout = useCallback((): void => {
    setActiveTrainer(null);
    setTrainerAuthError(null);
    setTrainerProfileMessage(null);
  }, [setActiveTrainer]);

  const handleAdminLogout = useCallback((): void => {
    setActiveAdmin(null);
    setAdminAuthError(null);
  }, [setActiveAdmin]);

  const handleAdminSettingsSave = useCallback(async (payload: {
    deliveryRecipients: string[];
    deliveryEmailSubjectTemplate: string;
    deliveryEmailBodyTemplate: string;
  }): Promise<void> => {
    try {
      setAdminSettingsBusy(true);
      setAdminSettingsError(null);
      const nextSettings = await updateSettings(payload);
      setSettings(nextSettings);
      setAdminSettingsMessage(messages.admin.recipientsSaved);
    } catch (err) {
      setAdminSettingsError(err instanceof Error ? err.message : messages.admin.recipientsSaveFailed);
    } finally {
      setAdminSettingsBusy(false);
    }
  }, [messages.admin.recipientsSaveFailed, messages.admin.recipientsSaved]);

  const refreshSubmissions = useCallback(async (): Promise<void> => {
    setAllSubmissions(await fetchSubmissions());
  }, []);

  const refreshModuleRegistrations = useCallback(async (): Promise<void> => {
    setModuleRegistrations(await fetchModuleRegistrations());
  }, []);

  const openRegistrationModal = useCallback((): void => {
    setSelectedEmployeeId("");
    setSelectedTemplateId("");
    setRegistrationMessage(null);
    setActionError(null);
    setRegistrationModalOpen(true);
  }, []);

  const closeRegistrationModal = useCallback((): void => {
    setRegistrationModalOpen(false);
    setSelectedEmployeeId("");
    setSelectedTemplateId("");
    setRegistrationMessage(null);
    setRegistrationConfirmMessage(null);
    setActionError(null);
  }, []);

  const acknowledgeRegistrationConfirm = useCallback((): void => {
    closeRegistrationModal();
    navigate("info");
  }, [closeRegistrationModal, navigate]);

  const refreshTemplates = useCallback(async (): Promise<void> => {
    const nextTemplates = await fetchTemplates();
    setTemplates(nextTemplates);
    if (selectedTemplateId) {
      const nextTemplate = await fetchTemplate(selectedTemplateId).catch(() => null);
      setSelectedTemplate(nextTemplate);
    }
  }, [selectedTemplateId]);

  const handleCreateEmployee = useCallback(async (payload: { firstName: string; lastName: string; email: string; role: EmployeeRole; team: EmployeeTeam; pin?: string }): Promise<void> => {
    const employee = await createEmployee(payload as Parameters<typeof createEmployee>[0]);
    setEmployees(await fetchEmployees());
    setSelectedEmployeeId(employee.id);
  }, []);

  const handleUpdateEmployee = useCallback(async (id: string, payload: { firstName?: string; lastName?: string; email?: string; role?: EmployeeRole; team?: EmployeeTeam; pin?: string }): Promise<void> => {
    await apiUpdateEmployee(id, payload);
    setEmployees(await fetchEmployees());
  }, []);

  const handleDeleteEmployee = useCallback(async (id: string): Promise<void> => {
    await apiDeleteEmployee(id);
    const updated = await fetchEmployees();
    setEmployees(updated);
    if (selectedEmployeeId === id) {
      setSelectedEmployeeId(updated.find((employee) => employee.role === "employee")?.id ?? "");
      setSelectedTemplateId("");
      setSelectedTemplate(null);
    }
  }, [selectedEmployeeId]);

  const handleBulkImportEmployees = useCallback(async (items: Array<{ firstName?: string; lastName?: string; name?: string; email: string; role?: string; team?: EmployeeTeam }>): Promise<{ created: number; skipped: number }> => {
    const result = await bulkCreateEmployees(items);
    setEmployees(await fetchEmployees());
    return { created: result.created, skipped: result.skipped };
  }, []);

  const updateDeliveryField = useCallback((field: keyof typeof deliveryForm, value: string): void => {
    setDeliveryForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleDownloadPdf = useCallback(async (submissionId: string): Promise<void> => {
    setActionError(null);
    setLastResult(null);

    try {
      const result = await fetchSubmissionPdf(submissionId);
      startBrowserDownload(result.blob, result.fileName);
      await refreshSubmissions();
      setLastResult({
        count: 1,
        emailDelivered: false,
        emailMessage: locale === "de"
          ? `PDF-Download gestartet: ${result.fileName}`
          : `PDF download started: ${result.fileName}`,
        sendStatus: "completed"
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : messages.app.pdfDownloadFailed);
    }
  }, [locale, messages.app.pdfDownloadFailed, refreshSubmissions]);

  const handleDownloadBundle = useCallback(async (employeeId: string, submissionIds?: string[]): Promise<void> => {
    setActionError(null);
    setLastResult(null);

    try {
      const result = await fetchSubmissionBundlePdf({ employeeId, submissionIds });
      startBrowserDownload(result.blob, result.fileName);
      await refreshSubmissions();
      setLastResult({
        count: submissionIds?.length ?? 0,
        emailDelivered: false,
        emailMessage: locale === "de"
          ? `Sammel-PDF-Download gestartet: ${result.fileName}`
          : `Bundle PDF download started: ${result.fileName}`,
        sendStatus: "completed"
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : messages.app.pdfDownloadFailed);
    }
  }, [locale, messages.app.pdfDownloadFailed, refreshSubmissions]);

  const handleOpenMailDraft = useCallback(async (employeeId: string, submissionIds?: string[]): Promise<void> => {
    const primaryRecipient = employeeId === selectedEmployeeId
      ? deliveryForm.primaryRecipient.trim() || undefined
      : undefined;
    const additionalCc = employeeId === selectedEmployeeId
      ? buildUniqueEmails([selectedEmployee?.email ?? "", deliveryForm.trainerEmail])
      : undefined;
    const result = await openSubmissionOutlookDraft({
      employeeId,
      submissionIds,
      primaryRecipient,
      additionalCc
    });

    await refreshSubmissions();
    setLastResult({
      count: result.count ?? (submissionIds?.length ?? 0),
      emailDelivered: false,
      emailMessage: locale === "de"
        ? `Outlook-Entwurf mit Anhang geöffnet: ${result.fileName}`
        : `Outlook draft opened with attachment: ${result.fileName}`,
      sendStatus: result.sendStatus
    });
  }, [deliveryForm.primaryRecipient, deliveryForm.trainerEmail, locale, refreshSubmissions, selectedEmployee?.email, selectedEmployeeId]);

  const handleOpenDelivery = useCallback((employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setActionError(null);
    setLastResult(null);
    navigate("delivery");
  }, [navigate]);

  const handleOpenDeliveryForModule = useCallback((employeeId: string, templateId?: string) => {
    setSelectedEmployeeId(employeeId);
    if (templateId) {
      setSelectedTemplateId(templateId);
    }
    setActionError(null);
    setLastResult(null);
    navigate("delivery");
  }, [navigate]);

  const handleDeliveryEmployeeSelect = useCallback((employeeId: string): void => {
    setSelectedEmployeeId(employeeId);
    setActionError(null);
    setLastResult(null);
  }, []);

  const handleDeliveryTemplateSelect = useCallback((templateId: string): void => {
    setSelectedTemplateId(templateId);
    setActionError(null);
    setLastResult(null);
  }, []);

  const createSubmission = useCallback(async (): Promise<void> => {
    if (!selectedEmployee || !selectedTemplate) {
      setActionError(messages.app.selectEmployeeAndDocument);
      return;
    }

    if (submissions.some((submission) => getModuleKey(submission.templateTitle) === getModuleKey(selectedTemplate.title))) {
      setActionError(locale === "de"
        ? "Dieses Modul wurde für den Mitarbeiter bereits erfasst."
        : "This module has already been recorded for the employee.");
      return;
    }

    setSavingDraft(true);
    setActionError(null);
    setLastResult(null);

    try {
      const trainerName = deliveryForm.trainerName.trim() || activeTrainer?.name || activeAdmin?.name || "";
      const trainerEmail = deliveryForm.trainerEmail.trim() || activeTrainer?.email || "";
      const ccRecipients = buildUniqueEmails([selectedEmployee.email, trainerEmail]);
      const result = await submitTraining({
        employeeId: selectedEmployee.id,
        templateId: selectedTemplate.id,
        employeeName: selectedEmployee.name,
        employeeEmail: selectedEmployee.email,
        trainerName,
        trainerEmail,
        primaryRecipient: deliveryForm.primaryRecipient.trim(),
        additionalCc: ccRecipients,
        employeeSignatureDataUrl: createAutoSignatureDataUrl(selectedEmployee.name),
        trainerSignatureDataUrl: createAutoSignatureDataUrl(trainerName),
        deliveryMode: "draft",
        sectionReviews: buildCompletedReviews(selectedTemplate)
      });
      await refreshSubmissions();
      await refreshModuleRegistrations();
      setLastResult({
        count: 1,
        emailDelivered: result.emailDelivered,
        emailMessage: result.emailMessage,
        sendStatus: result.sendStatus
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : messages.app.submissionFailed);
    } finally {
      setSavingDraft(false);
    }
  }, [activeAdmin?.name, activeTrainer?.email, activeTrainer?.name, deliveryForm.primaryRecipient, deliveryForm.trainerEmail, deliveryForm.trainerName, locale, messages.app.selectEmployeeAndDocument, messages.app.submissionFailed, refreshSubmissions, selectedEmployee, selectedTemplate, submissions]);

  const handleCreateModuleRegistration = useCallback(async (payload: { employeeId: string; templateIds: string[] }): Promise<void> => {
    try {
      setRegistrationBusy(true);
      setRegistrationMessage(null);
      setActionError(null);
      const result = await createModuleRegistrations(payload);
      await refreshModuleRegistrations();
      const moduleCount = result.registrations.length;
      const nextMessage = hasPrivilegedAccess
        ? (locale === "de"
          ? `${moduleCount} Modul${moduleCount === 1 ? "" : "e"} wurde${moduleCount === 1 ? "" : "n"} angemeldet.`
          : `${moduleCount} module${moduleCount === 1 ? "" : "s"} registered successfully.`)
        : (locale === "de"
          ? `Deine Anmeldung ist raus. ${moduleCount} Modul${moduleCount === 1 ? "" : "e"} wurde${moduleCount === 1 ? "" : "n"} erfasst. Ein Trainer wird sich bei dir melden.`
          : `Your registration has been submitted. ${moduleCount} module${moduleCount === 1 ? "" : "s"} were recorded. A trainer will contact you.`);

      if (hasPrivilegedAccess) {
        setRegistrationMessage(nextMessage);
      } else {
        setRegistrationConfirmMessage(nextMessage);
      }

    } catch (err) {
      setActionError(err instanceof Error ? err.message : (locale === "de" ? "Anmeldung fehlgeschlagen." : "Registration failed."));
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      setRegistrationBusy(false);
    }
  }, [hasPrivilegedAccess, locale, refreshModuleRegistrations]);

  const handleSendBatch = useCallback(async (employeeId: string, submissionIds?: string[]): Promise<void> => {
    const employee = employees.find((item) => item.id === employeeId);

    if (!employee) {
      setActionError(messages.app.selectEmployeeFirst);
      return;
    }

    setSendingBatch(true);
    setActionError(null);
    setLastResult(null);

    try {
      const result = await sendSubmissionBatch({
        employeeId,
        submissionIds,
        primaryRecipient: employeeId === selectedEmployeeId
          ? deliveryForm.primaryRecipient.trim() || undefined
          : undefined,
        additionalCc: employeeId === selectedEmployeeId
          ? buildUniqueEmails([employee.email, deliveryForm.trainerEmail])
          : undefined
      });
      await refreshSubmissions();
      setLastResult({
        count: result.count,
        emailDelivered: result.emailDelivered,
        emailMessage: result.emailMessage,
        sendStatus: result.sendStatus
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : messages.app.batchSendFailed);
    } finally {
      setSendingBatch(false);
    }
  }, [deliveryForm.primaryRecipient, deliveryForm.trainerEmail, employees, messages.app.batchSendFailed, messages.app.selectEmployeeFirst, refreshSubmissions, selectedEmployeeId]);

  const pageContent = useMemo(() => {
    if (effectiveView === "dashboard") {
      return (
        <Dashboard
          employees={scopedEmployees}
          templates={scopedTemplates}
          submissions={scopedSubmissions}
          visibleTeams={visibleTeams}
        />
      );
    }

    if (effectiveView === "info") {
      return <ProgramInfo onOpenRegistration={!hasPrivilegedAccess ? openRegistrationModal : undefined} />;
    }

    if (effectiveView === "employees") {
      return (
        <EmployeeManager
          employees={scopedEmployees}
          templates={scopedTemplates}
          submissions={scopedSubmissions}
          canManage={hasAdminAccess}
          canOpenDelivery={hasPrivilegedAccess}
          selectedEmployeeId={selectedEmployeeId}
          visibleTeams={visibleTeams}
          lockedTeam={trainerScopeTeam}
          onSelect={setSelectedEmployeeId}
          onOpenDelivery={handleOpenDelivery}
          onCreate={handleCreateEmployee}
          onUpdate={handleUpdateEmployee}
          onDelete={handleDeleteEmployee}
          onBulkImport={handleBulkImportEmployees}
        />
      );
    }

    if (effectiveView === "documents") {
      return (
        <TemplateCatalog
          templates={scopedTemplates}
          canManageTemplates={hasAdminAccess}
          visibleTeams={visibleTeams}
          onRefresh={refreshTemplates}
        />
      );
    }

    if (effectiveView === "training") {
      return (
        <RegistrationWorkspace
          employees={scopedEmployees}
          templates={scopedTemplates}
          submissions={scopedSubmissions}
          registrations={hasAdminAccess ? moduleRegistrations : trainerScopeTeam ? moduleRegistrations.filter((item) => item.team === trainerScopeTeam) : moduleRegistrations}
          visibleTeams={visibleTeams}
          lockedTeam={trainerScopeTeam}
          hasPrivilegedAccess={hasPrivilegedAccess}
          selectedEmployeeId={selectedEmployeeId}
          selectedTemplateId={selectedTemplateId}
          busy={registrationBusy}
          message={registrationMessage}
          error={actionError}
          onSelectEmployee={setSelectedEmployeeId}
          onSelectTemplate={setSelectedTemplateId}
          onCreateRegistration={handleCreateModuleRegistration}
          onOpenDelivery={handleOpenDeliveryForModule}
        />
      );
    }

    if (effectiveView === "delivery") {
      return (
        <DeliveryWorkspace
          employees={scopedEmployees}
          templates={deliveryTemplates}
          availableTemplates={scopedTemplates}
          allSubmissions={scopedSubmissions}
          settings={settings}
          selectedEmployee={selectedEmployee}
          selectedEmployeeId={selectedEmployeeId}
          selectedTemplate={selectedTemplateSummary}
          selectedTemplateId={selectedTemplateId}
          recipientOptions={settings.deliveryRecipients}
          canManageEmailTemplates={hasAdminAccess}
          form={deliveryForm}
          savingDraft={savingDraft}
          sendingBatch={sendingBatch}
          lastResult={lastResult}
          error={actionError}
          currentTrainer={activeTrainer}
          adminSettingsBusy={adminSettingsBusy}
          adminSettingsError={adminSettingsError}
          adminSettingsMessage={adminSettingsMessage}
          onFieldChange={updateDeliveryField}
          onSelectEmployee={handleDeliveryEmployeeSelect}
          onSelectTemplate={handleDeliveryTemplateSelect}
          onSaveDraft={createSubmission}
          onSendBatch={handleSendBatch}
          onDownloadPdf={handleDownloadPdf}
          onDownloadBundle={handleDownloadBundle}
          onOpenMailDraft={handleOpenMailDraft}
          onAdminSettingsSave={handleAdminSettingsSave}
        />
      );
    }

    return null;
  }, [actionError, activeTrainer, adminSettingsBusy, adminSettingsError, adminSettingsMessage, createSubmission, deliveryForm, deliveryTemplates, effectiveView, employees, handleAdminSettingsSave, handleBulkImportEmployees, handleCreateEmployee, handleCreateModuleRegistration, handleDeleteEmployee, handleDeliveryEmployeeSelect, handleDeliveryTemplateSelect, handleDownloadBundle, handleDownloadPdf, handleOpenDelivery, handleOpenDeliveryForModule, handleOpenMailDraft, handleSendBatch, handleUpdateEmployee, hasAdminAccess, hasPrivilegedAccess, lastResult, moduleRegistrations, openRegistrationModal, refreshTemplates, registrationBusy, registrationMessage, savingDraft, scopedEmployees, scopedSubmissions, scopedTemplates, selectedEmployee, selectedEmployeeId, selectedTemplateId, selectedTemplateSummary, sendingBatch, settings, trainerScopeTeam, updateDeliveryField, visibleTeams]);

  if (loading) return <div className="loading-screen">{messages.app.loading}</div>;
  if (error) return (
    <div className="loading-screen text-error">
      <p>{error}</p>
      <button className="btn btn-primary retry-button" onClick={() => setRetryCount((count) => count + 1)}>
        {messages.app.retry}
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      {hasPrivilegedAccess && (
        <AppSidebar
          currentView={currentView}
          collapsed={sidebarCollapsed}
          visibleViews={visibleViews}
          onToggleCollapse={handleToggleSidebar}
          onViewChange={navigate}
        />
      )}

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{messages.shell.viewTitles[effectiveView]}</span>
          <div className="topbar-actions">
            <LanguageToggle />
            <SessionPanel
              admin={activeAdmin}
              trainer={activeTrainer}
              trainerOptions={trainerOptions}
              adminAuthBusy={adminAuthBusy}
              adminAuthError={adminAuthError}
              trainerAuthBusy={trainerAuthBusy}
              trainerAuthError={trainerAuthError}
              trainerProfileBusy={trainerProfileBusy}
              trainerProfileMessage={trainerProfileMessage}
              onAdminLogin={handleAdminLogin}
              onTrainerLogin={handleTrainerLogin}
              onAdminLogout={handleAdminLogout}
              onTrainerLogout={handleTrainerLogout}
              onTrainerProfileSave={handleTrainerProfileSave}
            />
            <ThemeToggle />
          </div>
        </header>

        <div className={`content-area ${effectiveView === "employees" ? "content-area-locked" : ""}`}>
          {pageContent}
        </div>
      </div>

      {registrationModalOpen && !hasPrivilegedAccess && (
        <div className="session-profile-overlay" onClick={closeRegistrationModal}>
          <div className="session-profile-modal registration-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card registration-modal-card">
              <div className="card-header registration-modal-head">
                <div className="card-header-left">
                  <span className="eyebrow">{locale === "de" ? "Anmeldung" : "Registration"}</span>
                  <h3>{locale === "de" ? "Modul anmelden" : "Register module"}</h3>
                </div>
                <button type="button" className="btn btn-secondary" onClick={closeRegistrationModal}>
                  {messages.common.actions.close}
                </button>
              </div>
              <div className="card-body flush">
                <RegistrationWorkspace
                  employees={employees}
                  templates={templates}
                  submissions={allSubmissions}
                  registrations={moduleRegistrations}
                  visibleTeams={visibleTeams}
                  lockedTeam={null}
                  hasPrivilegedAccess={false}
                  selectedEmployeeId={selectedEmployeeId}
                  selectedTemplateId={selectedTemplateId}
                  busy={registrationBusy}
                  message={registrationMessage}
                  error={actionError}
                  variant="embedded"
                  onSelectEmployee={setSelectedEmployeeId}
                  onSelectTemplate={setSelectedTemplateId}
                  onCreateRegistration={handleCreateModuleRegistration}
                  onOpenDelivery={handleOpenDeliveryForModule}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {registrationConfirmMessage && !hasPrivilegedAccess && (
        <div className="session-profile-overlay registration-confirm-overlay">
          <div className="registration-confirm-dialog card" role="dialog" aria-modal="true" aria-labelledby="registration-confirm-title">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{locale === "de" ? "Bestätigung" : "Confirmation"}</span>
                <h3 id="registration-confirm-title">{locale === "de" ? "Anmeldung gesendet" : "Registration sent"}</h3>
              </div>
            </div>
            <div className="card-body registration-confirm-body">
              <p>{registrationConfirmMessage}</p>
              <div className="registration-confirm-actions">
                <button type="button" className="btn btn-primary" onClick={acknowledgeRegistrationConfirm}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}