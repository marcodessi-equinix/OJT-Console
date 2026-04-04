import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkCreateEmployees,
  createEmployee,
  deleteEmployee as apiDeleteEmployee,
  fetchEmployees,
  fetchSettings,
  fetchSubmissionPdf,
  fetchSubmissions,
  fetchTemplate,
  fetchTemplates,
  loginAdmin,
  loginTrainer,
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
import { SessionPanel } from "./components/SessionPanel";
import { TemplateCatalog } from "./components/TemplateCatalog";
import { ThemeToggle } from "./components/ThemeToggle";
import { useLanguage } from "./features/language/LanguageProvider";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { createAutoSignatureDataUrl } from "./utils/signature";
import type {
  AdminSession,
  AppSettings,
  BatchSendResponse,
  EmployeeProfile,
  EmployeeRole,
  EmployeeTeam,
  SectionReview,
  SubmissionListItem,
  SubmissionResponse,
  TrainerSession,
  TrainingTemplate,
  TrainingTemplateSummary
} from "./types/training";

const emptySettings: AppSettings = {
  defaultPrimaryRecipient: "",
  defaultCcMe: "",
  deliveryRecipients: [],
  smtpConfigured: false
};

const selectedEmployeeStorageKey = "ojt.selectedEmployeeId";
const selectedTemplateStorageKey = "ojt.selectedTemplateId";

const validViews: AppView[] = ["dashboard", "info", "employees", "documents", "delivery"];
const publicViews: AppView[] = ["dashboard", "info", "documents"];

function getViewFromPath(): AppView {
  const path = window.location.pathname.replace(/^\//, "");
  return validViews.includes(path as AppView) ? (path as AppView) : "dashboard";
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

export default function App() {
  const { locale, messages } = useLanguage();
  const [currentView, setCurrentView] = useState<AppView>(getViewFromPath);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [templates, setTemplates] = useState<TrainingTemplateSummary[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<SubmissionListItem[]>([]);
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
  const [lastResult, setLastResult] = useState<SubmissionResponse | BatchSendResponse | null>(null);
  const [adminAuthBusy, setAdminAuthBusy] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [trainerAuthBusy, setTrainerAuthBusy] = useState(false);
  const [trainerProfileBusy, setTrainerProfileBusy] = useState(false);
  const [trainerAuthError, setTrainerAuthError] = useState<string | null>(null);
  const [trainerProfileMessage, setTrainerProfileMessage] = useState<string | null>(null);
  const [adminSettingsBusy, setAdminSettingsBusy] = useState(false);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);
  const [adminSettingsMessage, setAdminSettingsMessage] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    trainerName: "",
    trainerEmail: "",
    primaryRecipient: ""
  });

  const hasAdminAccess = Boolean(activeAdmin);
  const hasTrainerAccess = Boolean(activeTrainer && !activeTrainer.mustChangePin);
  const hasPrivilegedAccess = hasAdminAccess || hasTrainerAccess;
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
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === selectedEmployeeId), [employees, selectedEmployeeId]);
  const deliveryTemplates = useMemo(() => {
    if (!selectedEmployee) {
      return templates;
    }

    return templates.filter((template) => template.team === selectedEmployee.team);
  }, [selectedEmployee, templates]);
  const selectedTemplateSummary = useMemo(() => deliveryTemplates.find((template) => template.id === selectedTemplateId) ?? null, [deliveryTemplates, selectedTemplateId]);
  const submissions = useMemo(() => {
    if (!selectedEmployeeId) {
      return [];
    }

    return allSubmissions
      .filter((submission) => submission.employeeId === selectedEmployeeId)
      .sort((left, right) => new Date(right.sentAt ?? right.createdAt).getTime() - new Date(left.sentAt ?? left.createdAt).getTime());
  }, [allSubmissions, selectedEmployeeId]);

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
    if (visibleViews.includes(currentView)) {
      return;
    }

    window.history.replaceState(null, "", "/dashboard");
    setCurrentView("dashboard");
  }, [currentView, visibleViews]);

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
        setSettings(nextSettings);
        setTemplates(nextTemplates);
        setEmployees(nextEmployees);
        setAllSubmissions(nextSubmissions);
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

    void fetchTemplate(selectedTemplateId)
      .then(setSelectedTemplate)
      .catch(() => {
        setSelectedTemplate(null);
        setSelectedTemplateId("");
      });
  }, [selectedTemplateId]);

  useEffect(() => {
    if (selectedEmployeeId && !employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(employees.find((employee) => employee.role === "employee")?.id ?? "");
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (selectedTemplateId && !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId("");
      setSelectedTemplate(null);
    }
  }, [selectedTemplateId, templates]);

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

  const handleAdminSettingsSave = useCallback(async (payload: { deliveryRecipients: string[] }): Promise<void> => {
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

  const refreshTemplates = useCallback(async (): Promise<void> => {
    const nextTemplates = await fetchTemplates();
    setTemplates(nextTemplates);
    if (selectedTemplateId) {
      const nextTemplate = await fetchTemplate(selectedTemplateId).catch(() => null);
      setSelectedTemplate(nextTemplate);
    }
  }, [selectedTemplateId]);

  const handleCreateEmployee = useCallback(async (payload: { firstName: string; lastName: string; email: string; role: EmployeeRole; team: EmployeeTeam }): Promise<void> => {
    const employee = await createEmployee(payload as Parameters<typeof createEmployee>[0]);
    setEmployees(await fetchEmployees());
    setSelectedEmployeeId(employee.id);
  }, []);

  const handleUpdateEmployee = useCallback(async (id: string, payload: { firstName?: string; lastName?: string; email?: string; role?: EmployeeRole; team?: EmployeeTeam }): Promise<void> => {
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
    const { blob, fileName } = await fetchSubmissionPdf(submissionId);
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  }, []);

  const handleOpenDelivery = useCallback((employeeId: string) => {
    setSelectedEmployeeId(employeeId);
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

    if (submissions.some((submission) => submission.templateId === selectedTemplate.id)) {
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
      setLastResult(result);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : messages.app.submissionFailed);
    } finally {
      setSavingDraft(false);
    }
  }, [activeAdmin?.name, activeTrainer?.email, activeTrainer?.name, deliveryForm.primaryRecipient, deliveryForm.trainerEmail, deliveryForm.trainerName, locale, messages.app.selectEmployeeAndDocument, messages.app.submissionFailed, refreshSubmissions, selectedEmployee, selectedTemplate, submissions]);

  const handleSendBatch = useCallback(async (): Promise<void> => {
    if (!selectedEmployee) {
      setActionError(messages.app.selectEmployeeFirst);
      return;
    }

    if (!deliveryForm.primaryRecipient.trim()) {
      setActionError(messages.app.fillDeliveryChecklist);
      return;
    }

    if (!submissions.some((submission) => submission.sendStatus === "draft")) {
      setActionError(locale === "de"
        ? "Für diesen Mitarbeiter gibt es keine offenen Entwürfe."
        : "There are no open drafts for this employee.");
      return;
    }

    setSendingBatch(true);
    setActionError(null);
    setLastResult(null);

    try {
      const result = await sendSubmissionBatch({
        employeeId: selectedEmployee.id,
        primaryRecipient: deliveryForm.primaryRecipient.trim(),
        additionalCc: buildUniqueEmails([selectedEmployee.email, deliveryForm.trainerEmail])
      });
      await refreshSubmissions();
      setLastResult(result);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : messages.app.batchSendFailed);
    } finally {
      setSendingBatch(false);
    }
  }, [deliveryForm.primaryRecipient, deliveryForm.trainerEmail, locale, messages.app.batchSendFailed, messages.app.fillDeliveryChecklist, messages.app.selectEmployeeFirst, refreshSubmissions, selectedEmployee, submissions]);

  const pageContent = useMemo(() => {
    if (currentView === "dashboard") {
      return (
        <Dashboard
          employees={employees}
          templates={templates}
          submissions={allSubmissions}
        />
      );
    }

    if (currentView === "info") {
      return <ProgramInfo />;
    }

    if (currentView === "employees") {
      return (
        <EmployeeManager
          employees={employees}
          templates={templates}
          submissions={allSubmissions}
          canManage={hasAdminAccess}
          canOpenDelivery={hasPrivilegedAccess}
          selectedEmployeeId={selectedEmployeeId}
          onSelect={setSelectedEmployeeId}
          onOpenDelivery={handleOpenDelivery}
          onCreate={handleCreateEmployee}
          onUpdate={handleUpdateEmployee}
          onDelete={handleDeleteEmployee}
          onBulkImport={handleBulkImportEmployees}
        />
      );
    }

    if (currentView === "documents") {
      return (
        <TemplateCatalog
          templates={templates}
          canManageTemplates={hasAdminAccess}
          onRefresh={refreshTemplates}
        />
      );
    }

    if (currentView === "delivery") {
      return (
        <DeliveryWorkspace
          employees={employees}
          templates={deliveryTemplates}
          selectedEmployee={selectedEmployee}
          selectedEmployeeId={selectedEmployeeId}
          selectedTemplate={selectedTemplateSummary}
          selectedTemplateId={selectedTemplateId}
          recipientOptions={settings.deliveryRecipients}
          form={deliveryForm}
          submissions={submissions}
          savingDraft={savingDraft}
          sendingBatch={sendingBatch}
          lastResult={lastResult}
          error={actionError}
          currentTrainer={activeTrainer}
          onFieldChange={updateDeliveryField}
          onSelectEmployee={handleDeliveryEmployeeSelect}
          onSelectTemplate={handleDeliveryTemplateSelect}
          onSaveDraft={createSubmission}
          onSendBatch={handleSendBatch}
          onDownloadPdf={handleDownloadPdf}
        />
      );
    }

    return null;
  }, [actionError, activeTrainer, allSubmissions, createSubmission, currentView, deliveryForm, deliveryTemplates, employees, handleBulkImportEmployees, handleCreateEmployee, handleDeleteEmployee, handleDeliveryEmployeeSelect, handleDeliveryTemplateSelect, handleDownloadPdf, handleOpenDelivery, handleSendBatch, handleUpdateEmployee, hasAdminAccess, hasPrivilegedAccess, lastResult, refreshTemplates, savingDraft, selectedEmployee, selectedEmployeeId, selectedTemplateId, selectedTemplateSummary, sendingBatch, settings.deliveryRecipients, submissions, templates, updateDeliveryField]);

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
      <AppSidebar
        currentView={currentView}
        collapsed={sidebarCollapsed}
        visibleViews={visibleViews}
        onToggleCollapse={handleToggleSidebar}
        onViewChange={navigate}
      />

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{messages.shell.viewTitles[currentView]}</span>
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
              settings={settings}
              adminSettingsBusy={adminSettingsBusy}
              adminSettingsError={adminSettingsError}
              adminSettingsMessage={adminSettingsMessage}
              onAdminLogin={handleAdminLogin}
              onTrainerLogin={handleTrainerLogin}
              onAdminLogout={handleAdminLogout}
              onTrainerLogout={handleTrainerLogout}
              onTrainerProfileSave={handleTrainerProfileSave}
              onAdminSettingsSave={handleAdminSettingsSave}
            />
            <ThemeToggle />
          </div>
        </header>

        <div className={`content-area ${currentView === "employees" ? "content-area-locked" : ""}`}>
          {pageContent}
        </div>
      </div>
    </div>
  );
}