import { useEffect, useMemo, useState } from "react";
import { getIntlLocale, getSortLocale, useLanguage } from "../features/language/LanguageProvider";
import { formatDate, getDateTimestamp } from "../utils/date";
import { countDistinctTemplateModules, getModuleKey, getRepresentativeSubmission, normalizeModuleTitle } from "../utils/moduleIdentity";
import { UiSelect } from "./UiSelect";
import type {
  AppSettings,
  EmployeeProfile,
  SubmissionListItem,
  SubmissionSendStatus,
  TrainerSession,
  TrainingTemplateSummary
} from "../types/training";

interface DeliveryFormState {
  trainerName: string;
  trainerEmail: string;
  primaryRecipient: string;
}

interface DeliveryActionResult {
  count: number;
  emailDelivered: boolean;
  emailMessage: string;
  sendStatus: SubmissionSendStatus;
}

interface Props {
  employees: EmployeeProfile[];
  templates: TrainingTemplateSummary[];
  availableTemplates: TrainingTemplateSummary[];
  allSubmissions: SubmissionListItem[];
  settings: AppSettings;
  selectedEmployee?: EmployeeProfile;
  selectedEmployeeId: string;
  selectedTemplate?: TrainingTemplateSummary | null;
  selectedTemplateId: string;
  recipientOptions: string[];
  canManageEmailTemplates: boolean;
  form: DeliveryFormState;
  savingDraft: boolean;
  sendingBatch: boolean;
  lastResult: DeliveryActionResult | null;
  error: string | null;
  currentTrainer?: TrainerSession | null;
  adminSettingsBusy: boolean;
  adminSettingsError: string | null;
  adminSettingsMessage: string | null;
  onFieldChange: (field: keyof DeliveryFormState, value: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectTemplate: (id: string) => void;
  onSaveDraft: () => Promise<void>;
  onSendBatch: (employeeId: string, submissionIds?: string[]) => Promise<void>;
  onDownloadPdf: (id: string) => Promise<void>;
  onDownloadBundle: (employeeId: string, submissionIds?: string[]) => Promise<void>;
  onOpenMailDraft: (employeeId: string, submissionIds?: string[]) => Promise<void>;
  onAdminSettingsSave: (payload: {
    deliveryRecipients: string[];
    deliveryEmailSubjectTemplate: string;
    deliveryEmailBodyTemplate: string;
  }) => Promise<void>;
}

interface DeliveryModuleEntry {
  moduleKey: string;
  moduleTitle: string;
  status: SubmissionSendStatus;
  actionSubmissionId: string;
  openSubmissionIds: string[];
  submission: SubmissionListItem;
}

interface DeliveryEmployeeGroup {
  employee: EmployeeProfile;
  modules: DeliveryModuleEntry[];
  openModules: DeliveryModuleEntry[];
  doneModules: DeliveryModuleEntry[];
  allModuleSubmissionIds: string[];
  openSubmissionIds: string[];
  counts: {
    open: number;
    done: number;
    completed: number;
    sent: number;
    total: number;
  };
  isFullyCompleted: boolean;
}

function formatDateTime(value: string | undefined, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

function normalizeEmailList(values: string[]): string[] {
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

function parseEmailEntries(value: string): string[] {
  return normalizeEmailList(value.split(/[;,\n]/));
}

function renderMailTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9]+)\s*}}/g, (_match, key: string) => values[key] ?? "");
}

function submissionSortValue(submission: SubmissionListItem): number {
  return getDateTimestamp(submission.sentAt ?? submission.completedAt ?? submission.createdAt);
}

function consolidateModuleEntries(submissions: SubmissionListItem[]): DeliveryModuleEntry[] {
  const grouped = new Map<string, SubmissionListItem[]>();

  for (const submission of submissions) {
    const moduleKey = getModuleKey(submission.templateTitle);
    const items = grouped.get(moduleKey) ?? [];
    items.push(submission);
    grouped.set(moduleKey, items);
  }

  return Array.from(grouped.entries())
    .map(([moduleKey, items]) => {
      const representative = getRepresentativeSubmission(items);
      const isDone = representative.sendStatus === "completed" || representative.sendStatus === "sent";

      return {
        moduleKey,
        moduleTitle: normalizeModuleTitle(representative.templateTitle),
        status: representative.sendStatus,
        actionSubmissionId: representative.id,
        openSubmissionIds: isDone ? [] : items.filter((item) => item.sendStatus !== "sent" && item.sendStatus !== "completed").map((item) => item.id),
        submission: representative
      };
    })
    .sort((left, right) => submissionSortValue(right.submission) - submissionSortValue(left.submission));
}

function submissionStatusTone(status: SubmissionListItem["sendStatus"]): "success" | "error" | "warn" {
  switch (status) {
    case "completed":
    case "sent":
      return "success";
    case "send_failed":
      return "error";
    default:
      return "warn";
  }
}

function submissionStatusLabel(
  status: SubmissionListItem["sendStatus"],
  messages: ReturnType<typeof useLanguage>["messages"],
  completedLabel: string
): string {
  switch (status) {
    case "sent":
      return messages.common.submissionStatus.sent;
    case "completed":
      return completedLabel;
    case "send_failed":
      return messages.common.submissionStatus.failed;
    default:
      return messages.common.submissionStatus.draft;
  }
}

export function DeliveryWorkspace({
  employees,
  templates,
  availableTemplates,
  allSubmissions,
  settings,
  selectedEmployee,
  selectedEmployeeId,
  selectedTemplate,
  selectedTemplateId,
  recipientOptions,
  canManageEmailTemplates,
  form,
  savingDraft,
  sendingBatch,
  lastResult,
  error,
  currentTrainer,
  adminSettingsBusy,
  adminSettingsError,
  adminSettingsMessage,
  onFieldChange,
  onSelectEmployee,
  onSelectTemplate,
  onSaveDraft,
  onSendBatch,
  onDownloadPdf,
  onDownloadBundle,
  onOpenMailDraft,
  onAdminSettingsSave
}: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const sortLocale = getSortLocale(locale);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [recipientDraft, setRecipientDraft] = useState("");
  const [deliveryRecipients, setDeliveryRecipients] = useState<string[]>(settings.deliveryRecipients ?? []);
  const [deliveryEmailSubjectTemplate, setDeliveryEmailSubjectTemplate] = useState(settings.deliveryEmailSubjectTemplate ?? "");
  const [deliveryEmailBodyTemplate, setDeliveryEmailBodyTemplate] = useState(settings.deliveryEmailBodyTemplate ?? "");
  const copy = locale === "de"
    ? {
        contextTitle: "Versandkontext",
        contextCopy: "Mitarbeiter, Modul und Empfänger auswählen, dann unten mit der Liste arbeiten.",
        listTitle: "Gespeicherte OJT-Module pro Mitarbeiter",
        listCopy: "Ein Modul gilt erst nach PDF-Export, Outlook-Entwurf oder erfolgreichem Versand als abgeschlossen.",
        activeRosterTitle: "Mitarbeiter mit offenem Fortschritt",
        activeRosterCopy: "Hier bleiben alle Mitarbeiter, solange nicht alle verfugbaren Module fur ihr Team abgeschlossen sind.",
        completedRosterTitle: "Vollständig abgeschlossene Mitarbeiter",
        completedRosterCopy: "Erst wenn alle verfugbaren Module fur einen Mitarbeiter abgeschlossen sind, erscheint er in dieser separaten Liste.",
        activeRosterEmpty: "Aktuell gibt es keine Mitarbeiter mit offenem Fortschritt.",
        completedRosterEmpty: "Noch keine vollständig abgeschlossenen Mitarbeiter.",
        openCount: "Offen",
        completedCount: "Abgeschlossen",
        sentCount: "Versendet",
        emptyAll: "Noch keine Module gespeichert.",
        emptySearch: "Keine Mitarbeiter oder Module für diese Suche gefunden.",
        emptyEmployee: "Für diesen Mitarbeiter sind noch keine Module gespeichert.",
        bulkDownload: "Alle als Sammel-PDF",
        bulkSend: "Offene versenden",
        bulkDraft: "Outlook-Entwurf",
        singleDownload: "PDF speichern",
        createdAt: "Erfasst:",
        completedAt: "Abgeschlossen:",
        sentAt: "Versendet:",
        recipient: "Empfänger",
        openModulesLabel: "Offene Module",
        doneModulesLabel: "Erledigte Module",
        noOpenModules: "Keine offenen Module.",
        noDoneModules: "Noch nichts erledigt.",
        searchPlaceholder: "Nach Mitarbeiter oder Modul suchen",
        savedModules: "gespeicherte Module",
        mailDraftHint: "Outlook wird direkt mit Anhang geöffnet. CC-Adressen werden für Outlook mit Semikolon getrennt vorbereitet.",
        completedLabel: "Abgeschlossen",
        resultPrefix: "Letzte Aktion",
        currentEmployee: "Mitarbeiter",
        currentModule: "Modul",
        moduleHint: "Die Sprache wird ausgeblendet. Pro Modul wird nur ein Eintrag geführt.",
        ccLabel: "CC",
        ccHint: "Mitarbeiter und Trainer werden automatisch erkannt und sauber als Outlook-CC vorbereitet.",
        saveDraftHint: "Speichert das ausgewählte Modul als offenen Eintrag in der Liste unten.",
        adminMailTitle: "E-Mail Vorlage",
        adminMailCopy: "Als Admin kannst du hier Empfänger, Betreff und Text direkt für den OJT-Versand anpassen.",
        recipientsLabel: "Empfängerliste",
        recipientsPlaceholder: "mail1@firma.de; mail2@firma.de",
        recipientsHint: "Mehrere Adressen mit Komma, Semikolon oder Zeilenumbruch trennen.",
        recipientsAdd: "Übernehmen",
        subjectLabel: "Betreff",
        bodyLabel: "E-Mail Text",
        previewLabel: "Vorschau",
        previewSubject: "Betreff",
        previewTo: "An",
        previewCc: "CC",
        previewBody: "Text",
        previewEmpty: "Wähle oben Mitarbeiter, Modul und Empfänger, damit die Vorschau mit echten Daten gefüllt wird.",
        saveMailConfig: "Vorlage speichern",
        placeholders: "Platzhalter: {{employeeName}}, {{employeeEmail}}, {{trainerName}}, {{trainerEmail}}, {{templateTitle}}, {{moduleCount}}, {{moduleList}}, {{primaryRecipient}}, {{ccRecipients}}"
      }
    : {
        contextTitle: "Delivery context",
        contextCopy: "Pick employee, module, and recipient, then do the actual work in the list below.",
        listTitle: "Stored OJT modules by employee",
        listCopy: "A module only counts as completed after PDF export, Outlook draft creation, or successful send.",
        activeRosterTitle: "Employees with remaining progress",
        activeRosterCopy: "Employees stay here until every available module for their team has been completed.",
        completedRosterTitle: "Fully completed employees",
        completedRosterCopy: "An employee only moves into this separate list once every available module has been completed.",
        activeRosterEmpty: "There are currently no employees with remaining progress.",
        completedRosterEmpty: "No fully completed employees yet.",
        openCount: "Open",
        completedCount: "Completed",
        sentCount: "Sent",
        emptyAll: "No modules stored yet.",
        emptySearch: "No employees or modules match this search.",
        emptyEmployee: "No modules are stored for this employee yet.",
        bulkDownload: "Save all as bundle PDF",
        bulkSend: "Send open items",
        bulkDraft: "Outlook draft",
        singleDownload: "Save PDF",
        createdAt: "Recorded:",
        completedAt: "Completed:",
        sentAt: "Sent:",
        recipient: "Recipient",
        openModulesLabel: "Open modules",
        doneModulesLabel: "Completed modules",
        noOpenModules: "No open modules.",
        noDoneModules: "Nothing completed yet.",
        searchPlaceholder: "Search by employee or module",
        savedModules: "stored modules",
        mailDraftHint: "Outlook opens directly with the attachment. CC addresses are prepared in Outlook format using semicolons.",
        completedLabel: "Completed",
        resultPrefix: "Last action",
        currentEmployee: "Employee",
        currentModule: "Module",
        moduleHint: "Language labels are hidden. Each module is treated as one logical item.",
        ccLabel: "CC",
        ccHint: "Employee and trainer addresses are detected automatically and prepared cleanly for Outlook CC.",
        saveDraftHint: "Stores the selected module as an open item in the list below.",
        adminMailTitle: "E-mail template",
        adminMailCopy: "As admin you can edit recipients, subject, and body for the OJT delivery directly here.",
        recipientsLabel: "Recipient list",
        recipientsPlaceholder: "mail1@company.com; mail2@company.com",
        recipientsHint: "Separate multiple addresses with commas, semicolons, or line breaks.",
        recipientsAdd: "Apply",
        subjectLabel: "Subject",
        bodyLabel: "E-mail body",
        previewLabel: "Preview",
        previewSubject: "Subject",
        previewTo: "To",
        previewCc: "CC",
        previewBody: "Body",
        previewEmpty: "Select employee, module, and recipient above to fill the preview with real data.",
        saveMailConfig: "Save template",
        placeholders: "Placeholders: {{employeeName}}, {{employeeEmail}}, {{trainerName}}, {{trainerEmail}}, {{templateTitle}}, {{moduleCount}}, {{moduleList}}, {{primaryRecipient}}, {{ccRecipients}}"
      };

  useEffect(() => {
    setDeliveryRecipients(settings.deliveryRecipients ?? []);
  }, [settings.deliveryRecipients]);

  useEffect(() => {
    setDeliveryEmailSubjectTemplate(settings.deliveryEmailSubjectTemplate ?? "");
    setDeliveryEmailBodyTemplate(settings.deliveryEmailBodyTemplate ?? "");
  }, [settings.deliveryEmailBodyTemplate, settings.deliveryEmailSubjectTemplate]);

  const sortedEmployees = useMemo(() => employees
    .filter((employee) => employee.role === "employee")
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, sortLocale)), [employees, sortLocale]);

  const employeeOptions = sortedEmployees.map((employee) => ({
    value: employee.id,
    label: `${employee.name} (${employee.team})`,
    description: employee.email
  }));

  const selectedEmployeeModuleKeys = useMemo(() => new Set(
    allSubmissions
      .filter((submission) => submission.employeeId === selectedEmployeeId)
      .map((submission) => getModuleKey(submission.templateTitle))
  ), [allSubmissions, selectedEmployeeId]);

  const templateOptions = templates
    .filter((template) => !selectedEmployeeModuleKeys.has(getModuleKey(template.title)))
    .slice()
    .sort((left, right) => normalizeModuleTitle(left.title).localeCompare(normalizeModuleTitle(right.title), sortLocale))
    .map((template) => ({
      value: template.id,
      label: normalizeModuleTitle(template.title),
      description: template.sourceFile
    }));

  const recipientSelectOptions = normalizeEmailList([...recipientOptions, ...deliveryRecipients]).map((recipient) => ({
    value: recipient,
    label: recipient
  }));

  const selectedEmployeeSubmissions = useMemo(() => allSubmissions
    .filter((submission) => submission.employeeId === selectedEmployeeId)
    .sort((left, right) => getDateTimestamp(right.sentAt ?? right.completedAt ?? right.createdAt) - getDateTimestamp(left.sentAt ?? left.completedAt ?? left.createdAt)), [allSubmissions, selectedEmployeeId]);
  const selectedEmployeeModuleEntries = useMemo(() => consolidateModuleEntries(selectedEmployeeSubmissions), [selectedEmployeeSubmissions]);

  const availableModuleCountByTeam = useMemo(() => {
    const counts = new Map<TrainingTemplateSummary["team"], number>();

    for (const template of availableTemplates) {
      const teamTemplates = availableTemplates.filter((item) => item.team === template.team);
      counts.set(template.team, countDistinctTemplateModules(teamTemplates));
    }

    return counts;
  }, [availableTemplates]);

  const groupedEmployees = useMemo<DeliveryEmployeeGroup[]>(() => {
    const needle = submissionSearch.trim().toLowerCase();

    return sortedEmployees
      .map((employee) => {
        const submissions = allSubmissions
          .filter((submission) => submission.employeeId === employee.id)
          .sort((left, right) => getDateTimestamp(right.sentAt ?? right.completedAt ?? right.createdAt) - getDateTimestamp(left.sentAt ?? left.completedAt ?? left.createdAt));
        const modules = consolidateModuleEntries(submissions);
        const openModules = modules.filter((module) => module.status !== "completed" && module.status !== "sent");
        const doneModules = modules.filter((module) => module.status === "completed" || module.status === "sent");
        const allModuleSubmissionIds = modules.map((module) => module.actionSubmissionId);
        const openSubmissionIds = openModules.flatMap((module) => module.openSubmissionIds);
        const totalAvailableModules = availableModuleCountByTeam.get(employee.team) ?? 0;
        const doneModuleCount = doneModules.length;
        const isFullyCompleted = totalAvailableModules > 0 && doneModuleCount >= totalAvailableModules;

        const matchesSearch = !needle || [
          employee.name,
          employee.email,
          ...modules.map((module) => module.moduleTitle)
        ].some((value) => value.toLowerCase().includes(needle));

        return {
          employee,
          modules,
          openModules,
          doneModules,
          allModuleSubmissionIds,
          openSubmissionIds,
          counts: {
            open: openModules.length,
            done: doneModuleCount,
            completed: doneModules.filter((module) => module.status === "completed").length,
            sent: doneModules.filter((module) => module.status === "sent").length,
            total: totalAvailableModules
          },
          isFullyCompleted,
          matchesSearch
        };
      })
      .filter((item) => item.matchesSearch);
  }, [allSubmissions, availableModuleCountByTeam, sortedEmployees, submissionSearch]);

  const activeEmployeeGroups = useMemo(() => groupedEmployees
    .filter((item) => !item.isFullyCompleted), [groupedEmployees]);

  const completedEmployeeGroups = useMemo(() => groupedEmployees
    .filter((item) => item.isFullyCompleted), [groupedEmployees]);

  const suggestedCcRecipients = useMemo(() => normalizeEmailList([
    selectedEmployee?.email ?? "",
    currentTrainer?.email ?? form.trainerEmail
  ]), [currentTrainer?.email, form.trainerEmail, selectedEmployee?.email]);

  const modulePreviewList = useMemo(() => Array.from(new Set([
    ...selectedEmployeeSubmissions.map((submission) => normalizeModuleTitle(submission.templateTitle)),
    ...(selectedTemplate ? [normalizeModuleTitle(selectedTemplate.title)] : [])
  ].filter(Boolean))), [selectedEmployeeSubmissions, selectedTemplate]);

  const previewValues = useMemo(() => {
    const trainerName = currentTrainer?.name || form.trainerName || "";
    const trainerEmail = currentTrainer?.email || form.trainerEmail || "";
    const primaryRecipient = form.primaryRecipient.trim() || deliveryRecipients[0] || "";
    const ccRecipients = suggestedCcRecipients.join("; ");
    const moduleList = modulePreviewList.map((title) => `- ${title}`).join("\n");

    return {
      employeeName: selectedEmployee?.name ?? "",
      employeeEmail: selectedEmployee?.email ?? "",
      trainerName,
      trainerEmail,
      templateTitle: modulePreviewList.length === 1 ? modulePreviewList[0] : `${modulePreviewList.length} ${locale === "de" ? "Module" : "modules"}`,
      moduleCount: String(modulePreviewList.length),
      moduleList,
      primaryRecipient,
      ccRecipients
    };
  }, [currentTrainer?.email, currentTrainer?.name, deliveryRecipients, form.primaryRecipient, form.trainerEmail, form.trainerName, locale, modulePreviewList, selectedEmployee?.email, selectedEmployee?.name, suggestedCcRecipients]);

  const previewSubject = renderMailTemplate(deliveryEmailSubjectTemplate, previewValues);
  const previewBody = renderMailTemplate(deliveryEmailBodyTemplate, previewValues);

  async function handleAdminSave(): Promise<void> {
    await onAdminSettingsSave({
      deliveryRecipients,
      deliveryEmailSubjectTemplate,
      deliveryEmailBodyTemplate
    });
  }

  function handleAddRecipients(): void {
    const nextEntries = parseEmailEntries(recipientDraft);
    if (!nextEntries.length) {
      return;
    }

    setDeliveryRecipients((current) => normalizeEmailList([...current, ...nextEntries]));
    setRecipientDraft("");
  }

  function handleRemoveRecipient(recipient: string): void {
    setDeliveryRecipients((current) => current.filter((item) => item !== recipient));
  }

  function formatCompletionProgress(doneCount: number, totalCount: number): string {
    if (totalCount <= 0) {
      return locale === "de" ? "Keine Module verfugbar" : "No modules available";
    }

    return locale === "de"
      ? `${doneCount} von ${totalCount} Modulen abgeschlossen`
      : `${doneCount} of ${totalCount} modules completed`;
  }

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="eyebrow">{messages.delivery.contextEyebrow}</span>
            <h2>{copy.contextTitle}</h2>
          </div>
        </div>
        <div className="card-body stack-lg">
          <p className="text-sm text-sec">{copy.contextCopy}</p>

          <div className="delivery-context-grid">
            <div className="form-group form-span-2">
              <label className="form-label" htmlFor="delivery-employee-select">{messages.delivery.switchEmployee}</label>
              <UiSelect
                id="delivery-employee-select"
                value={selectedEmployeeId}
                options={employeeOptions}
                onChange={onSelectEmployee}
                placeholder={messages.delivery.selectEmployee}
                searchable
                searchPlaceholder={messages.delivery.employeeSearchEmpty}
              />
            </div>

            <div className="form-group form-span-2">
              <label className="form-label" htmlFor="delivery-template-select">{copy.currentModule}</label>
              <UiSelect
                id="delivery-template-select"
                value={selectedTemplateId}
                options={templateOptions}
                onChange={onSelectTemplate}
                placeholder={messages.delivery.currentDocumentFallback}
                searchable
                searchPlaceholder={messages.delivery.searchPlaceholder}
              />
              <p className="text-xs text-sec">{copy.moduleHint}</p>
            </div>

            <div className="form-group">
              <label className="form-label">{messages.delivery.employeeNameLabel}</label>
              <div className="delivery-static-field">
                {selectedEmployee?.name || messages.common.values.notSelected}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{messages.delivery.employeeEmailLabel}</label>
              <div className="delivery-static-field">
                {selectedEmployee?.email || messages.common.values.notSelected}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{messages.delivery.trainerName}</label>
              <div className="delivery-static-field">
                {currentTrainer?.name || form.trainerName || messages.common.values.notSelected}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{messages.delivery.trainerEmail}</label>
              <div className="delivery-static-field">
                {currentTrainer?.email || form.trainerEmail || messages.common.values.notSelected}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="primary-recipient">{messages.delivery.primaryRecipient}</label>
              <UiSelect
                id="primary-recipient"
                value={form.primaryRecipient}
                options={recipientSelectOptions}
                onChange={(value) => onFieldChange("primaryRecipient", value)}
                placeholder={messages.delivery.primaryRecipientPlaceholder}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{copy.ccLabel}</label>
              <div className="delivery-static-field">
                {suggestedCcRecipients.length ? suggestedCcRecipients.join("; ") : messages.delivery.autoCcPending}
              </div>
              <p className="text-xs text-sec">{copy.ccHint}</p>
            </div>

            <div className="delivery-context-item">
              <span className="delivery-context-label">{copy.currentEmployee}</span>
              <strong>{selectedEmployee?.name ?? messages.common.values.notSelected}</strong>
              <small>{selectedEmployee ? `${selectedEmployee.email} - ${selectedEmployee.team} - ${selectedEmployeeModuleEntries.length} ${copy.savedModules}` : messages.delivery.currentEmployeeHint}</small>
            </div>

            <div className="delivery-context-item">
              <span className="delivery-context-label">{copy.currentModule}</span>
              <strong>{selectedTemplate ? normalizeModuleTitle(selectedTemplate.title) : messages.delivery.currentDocumentFallback}</strong>
              <small>{selectedTemplate?.sourceFile ?? messages.delivery.currentDocumentHint}</small>
            </div>
          </div>

          {error && <p className="text-error text-sm">{error}</p>}
          <p className="text-xs text-sec">{copy.saveDraftHint}</p>

          <div className="action-bar">
            <button className="btn" onClick={() => void onSaveDraft()} disabled={savingDraft || !selectedEmployee || !selectedTemplate}>
              {savingDraft ? messages.delivery.saveBusy : messages.delivery.saveDraft}
            </button>
          </div>

          {lastResult && (
            <div className={`result-banner ${lastResult.sendStatus === "send_failed" ? "warn" : "success"}`}>
              <span>{copy.resultPrefix}: {lastResult.emailMessage}</span>
            </div>
          )}

          {canManageEmailTemplates && (
            <div className="delivery-mail-config">
              <div className="delivery-mail-config-head">
                <div>
                  <span className="eyebrow">{messages.shell.topbarAdmin}</span>
                  <h3>{copy.adminMailTitle}</h3>
                  <p className="text-sm text-sec">{copy.adminMailCopy}</p>
                </div>
              </div>

              <div className="delivery-mail-grid">
                <div className="stack-md">
                  <div className="form-group">
                    <label className="form-label" htmlFor="delivery-recipient-bulk">{copy.recipientsLabel}</label>
                    <div className="session-recipient-input-row">
                      <input
                        id="delivery-recipient-bulk"
                        className="form-input"
                        type="text"
                        value={recipientDraft}
                        onChange={(event) => setRecipientDraft(event.target.value)}
                        placeholder={copy.recipientsPlaceholder}
                      />
                      <button className="btn" type="button" onClick={handleAddRecipients} disabled={!recipientDraft.trim()}>
                        {copy.recipientsAdd}
                      </button>
                    </div>
                    <p className="text-xs text-sec">{copy.recipientsHint}</p>
                  </div>

                  <div className="session-recipient-list">
                    {deliveryRecipients.length ? deliveryRecipients.map((recipient) => (
                      <div key={recipient} className="session-recipient-item">
                        <span>{recipient}</span>
                        <button className="btn btn-sm" type="button" onClick={() => handleRemoveRecipient(recipient)}>
                          {messages.common.actions.delete}
                        </button>
                      </div>
                    )) : <p className="text-sm text-sec">{messages.admin.recipientsEmpty}</p>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="delivery-mail-subject">{copy.subjectLabel}</label>
                    <input
                      id="delivery-mail-subject"
                      className="form-input"
                      type="text"
                      value={deliveryEmailSubjectTemplate}
                      onChange={(event) => setDeliveryEmailSubjectTemplate(event.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="delivery-mail-body">{copy.bodyLabel}</label>
                    <textarea
                      id="delivery-mail-body"
                      className="form-input session-admin-textarea"
                      rows={10}
                      value={deliveryEmailBodyTemplate}
                      onChange={(event) => setDeliveryEmailBodyTemplate(event.target.value)}
                    />
                    <p className="text-xs text-sec">{copy.placeholders}</p>
                  </div>

                  {adminSettingsError && <p className="text-error text-sm">{adminSettingsError}</p>}
                  {adminSettingsMessage && <p className="text-sm trainer-session-success">{adminSettingsMessage}</p>}

                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void handleAdminSave()}
                    disabled={adminSettingsBusy || deliveryRecipients.length === 0 || !deliveryEmailSubjectTemplate.trim() || !deliveryEmailBodyTemplate.trim()}
                  >
                    {adminSettingsBusy ? messages.common.actions.saving : copy.saveMailConfig}
                  </button>
                </div>

                <div className="delivery-mail-preview">
                  <div className="delivery-mail-preview-head">
                    <span className="eyebrow">{copy.previewLabel}</span>
                    <h4>{copy.previewLabel}</h4>
                  </div>

                  {!selectedEmployee && !selectedTemplate && !form.primaryRecipient ? (
                    <p className="text-sm text-sec">{copy.previewEmpty}</p>
                  ) : (
                    <div className="delivery-mail-preview-card">
                      <div className="delivery-mail-preview-row">
                        <span>{copy.previewTo}</span>
                        <strong>{previewValues.primaryRecipient || messages.common.values.notSet}</strong>
                      </div>
                      <div className="delivery-mail-preview-row">
                        <span>{copy.previewCc}</span>
                        <strong>{previewValues.ccRecipients || messages.common.values.none}</strong>
                      </div>
                      <div className="delivery-mail-preview-row delivery-mail-preview-subject">
                        <span>{copy.previewSubject}</span>
                        <strong>{previewSubject || messages.common.values.notSet}</strong>
                      </div>
                      <div className="delivery-mail-preview-body">
                        <span>{copy.previewBody}</span>
                        <pre>{previewBody || messages.common.values.notSet}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header delivery-list-header">
          <div className="card-header-left">
            <span className="eyebrow">{messages.delivery.sendCenterEyebrow}</span>
            <h2>{copy.listTitle}</h2>
          </div>
        </div>
        <div className="card-body stack-md">
          <p className="text-sm text-sec">{copy.listCopy}</p>

          <div className="delivery-filter-bar">
            <input
              type="text"
              className="form-input delivery-search-input"
              placeholder={copy.searchPlaceholder}
              value={submissionSearch}
              onChange={(event) => setSubmissionSearch(event.target.value)}
            />
          </div>

          {!groupedEmployees.length ? (
            <div className="empty-state">{submissionSearch.trim() ? copy.emptySearch : copy.emptyAll}</div>
          ) : (
            <div className="delivery-roster-sections">
              <section className="delivery-roster-section">
                <div className="delivery-roster-section-head">
                  <div>
                    <h3>{copy.activeRosterTitle}</h3>
                    <p className="text-sm text-sec">{copy.activeRosterCopy}</p>
                  </div>
                  <span className="badge badge-warn">{activeEmployeeGroups.length}</span>
                </div>

                {activeEmployeeGroups.length ? (
                  <div className="delivery-roster">
                    {activeEmployeeGroups.map(({ employee, modules, openModules, doneModules, allModuleSubmissionIds, openSubmissionIds, counts }) => (
                      <article key={employee.id} className="delivery-employee-card">
                        <div className="delivery-employee-head">
                          <div>
                            <h3>{employee.name}</h3>
                            <p>{employee.email} - {employee.team}</p>
                            <p className="delivery-progress-text">{formatCompletionProgress(counts.done, counts.total)}</p>
                          </div>
                          <div className="delivery-employee-stats">
                            <span className="badge badge-warn">{copy.openCount}: {counts.open}</span>
                            <span className="badge badge-success">{copy.completedCount}: {counts.completed}</span>
                            <span className="badge badge-primary">{copy.sentCount}: {counts.sent}</span>
                          </div>
                        </div>

                        <div className="delivery-employee-toolbar">
                          <span className="text-sm text-sec">{copy.recipient}: {modules[0]?.submission.primaryRecipient || messages.common.values.notSet}</span>
                          <div className="delivery-bulk-actions">
                            <button className="btn btn-sm" onClick={() => void onDownloadBundle(employee.id, allModuleSubmissionIds)} disabled={!allModuleSubmissionIds.length}>
                              {copy.bulkDownload}
                            </button>
                            <button className="btn btn-sm btn-primary" onClick={() => void onSendBatch(employee.id, openSubmissionIds)} disabled={sendingBatch || !openSubmissionIds.length}>
                              {sendingBatch ? messages.delivery.sending : copy.bulkSend}
                            </button>
                            <button className="btn btn-sm" onClick={() => void onOpenMailDraft(employee.id, openSubmissionIds)} disabled={!openSubmissionIds.length}>
                              {copy.bulkDraft}
                            </button>
                          </div>
                        </div>

                        {!modules.length ? (
                          <div className="empty-state delivery-employee-empty">{copy.emptyEmployee}</div>
                        ) : (
                          <div className="delivery-module-grid">
                            <section className="delivery-module-section">
                              <div className="delivery-module-section-head">
                                <h4>{copy.openModulesLabel}</h4>
                                <span className="badge badge-warn">{openModules.length}</span>
                              </div>
                              {openModules.length ? (
                                <div className="delivery-module-list">
                                  {openModules.map((module) => {
                                    const submission = module.submission;
                                    return (
                                      <div key={module.moduleKey} className="delivery-module-item">
                                        <div className="delivery-module-head">
                                          <div>
                                            <strong>{module.moduleTitle}</strong>
                                            <p>{submission.primaryRecipient || messages.common.values.notSet}</p>
                                          </div>
                                          <span className={`badge badge-${submissionStatusTone(module.status)}`}>
                                            {submissionStatusLabel(module.status, messages, copy.completedLabel)}
                                          </span>
                                        </div>

                                        <div className="delivery-module-meta">
                                          <span>{copy.createdAt} {formatDateTime(submission.createdAt, intlLocale)}</span>
                                          {submission.completedAt && <span>{copy.completedAt} {formatDateTime(submission.completedAt, intlLocale)}</span>}
                                          {submission.sentAt && <span>{copy.sentAt} {formatDateTime(submission.sentAt, intlLocale)}</span>}
                                          {submission.ccRecipients.length > 0 && <span>{messages.delivery.ccLabel} {submission.ccRecipients.join("; ")}</span>}
                                        </div>

                                        {submission.emailMessage && <p className="delivery-list-note text-sm text-sec">{submission.emailMessage}</p>}

                                        <div className="delivery-list-actions">
                                          <button className="btn btn-sm" onClick={() => void onDownloadPdf(module.actionSubmissionId)}>
                                            {copy.singleDownload}
                                          </button>
                                          <button className="btn btn-sm" onClick={() => void onOpenMailDraft(employee.id, [module.actionSubmissionId])}>
                                            {copy.bulkDraft}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="empty-state delivery-module-empty">{copy.noOpenModules}</div>
                              )}
                            </section>

                            <section className="delivery-module-section">
                              <div className="delivery-module-section-head">
                                <h4>{copy.doneModulesLabel}</h4>
                                <span className="badge badge-success">{doneModules.length}</span>
                              </div>
                              {doneModules.length ? (
                                <div className="delivery-module-list">
                                  {doneModules.map((module) => {
                                    const submission = module.submission;
                                    return (
                                      <div key={module.moduleKey} className="delivery-module-item">
                                        <div className="delivery-module-head">
                                          <div>
                                            <strong>{module.moduleTitle}</strong>
                                            <p>{submission.primaryRecipient || messages.common.values.notSet}</p>
                                          </div>
                                          <span className={`badge badge-${submissionStatusTone(module.status)}`}>
                                            {submissionStatusLabel(module.status, messages, copy.completedLabel)}
                                          </span>
                                        </div>

                                        <div className="delivery-module-meta">
                                          <span>{copy.createdAt} {formatDateTime(submission.createdAt, intlLocale)}</span>
                                          {submission.completedAt && <span>{copy.completedAt} {formatDateTime(submission.completedAt, intlLocale)}</span>}
                                          {submission.sentAt && <span>{copy.sentAt} {formatDateTime(submission.sentAt, intlLocale)}</span>}
                                          {submission.ccRecipients.length > 0 && <span>{messages.delivery.ccLabel} {submission.ccRecipients.join("; ")}</span>}
                                        </div>

                                        {submission.emailMessage && <p className="delivery-list-note text-sm text-sec">{submission.emailMessage}</p>}

                                        <div className="delivery-list-actions">
                                          <button className="btn btn-sm" onClick={() => void onDownloadPdf(module.actionSubmissionId)}>
                                            {copy.singleDownload}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="empty-state delivery-module-empty">{copy.noDoneModules}</div>
                              )}
                            </section>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">{copy.activeRosterEmpty}</div>
                )}
              </section>

              <section className="delivery-roster-section">
                <div className="delivery-roster-section-head">
                  <div>
                    <h3>{copy.completedRosterTitle}</h3>
                    <p className="text-sm text-sec">{copy.completedRosterCopy}</p>
                  </div>
                  <span className="badge badge-success">{completedEmployeeGroups.length}</span>
                </div>

                {completedEmployeeGroups.length ? (
                  <div className="delivery-roster delivery-roster-completed">
                    {completedEmployeeGroups.map(({ employee, modules, openModules, doneModules, allModuleSubmissionIds, openSubmissionIds, counts }) => (
                      <article key={employee.id} className="delivery-employee-card">
                        <div className="delivery-employee-head">
                          <div>
                            <h3>{employee.name}</h3>
                            <p>{employee.email} - {employee.team}</p>
                            <p className="delivery-progress-text">{formatCompletionProgress(counts.done, counts.total)}</p>
                          </div>
                          <div className="delivery-employee-stats">
                            <span className="badge badge-warn">{copy.openCount}: {counts.open}</span>
                            <span className="badge badge-success">{copy.completedCount}: {counts.completed}</span>
                            <span className="badge badge-primary">{copy.sentCount}: {counts.sent}</span>
                          </div>
                        </div>

                        <div className="delivery-employee-toolbar">
                          <span className="text-sm text-sec">{copy.recipient}: {modules[0]?.submission.primaryRecipient || messages.common.values.notSet}</span>
                          <div className="delivery-bulk-actions">
                            <button className="btn btn-sm" onClick={() => void onDownloadBundle(employee.id, allModuleSubmissionIds)} disabled={!allModuleSubmissionIds.length}>
                              {copy.bulkDownload}
                            </button>
                            <button className="btn btn-sm btn-primary" onClick={() => void onSendBatch(employee.id, openSubmissionIds)} disabled={sendingBatch || !openSubmissionIds.length}>
                              {sendingBatch ? messages.delivery.sending : copy.bulkSend}
                            </button>
                            <button className="btn btn-sm" onClick={() => void onOpenMailDraft(employee.id, openSubmissionIds)} disabled={!openSubmissionIds.length}>
                              {copy.bulkDraft}
                            </button>
                          </div>
                        </div>

                        <div className="delivery-module-grid">
                          <section className="delivery-module-section">
                            <div className="delivery-module-section-head">
                              <h4>{copy.openModulesLabel}</h4>
                              <span className="badge badge-warn">{openModules.length}</span>
                            </div>
                            <div className="empty-state delivery-module-empty">{copy.noOpenModules}</div>
                          </section>

                          <section className="delivery-module-section">
                            <div className="delivery-module-section-head">
                              <h4>{copy.doneModulesLabel}</h4>
                              <span className="badge badge-success">{doneModules.length}</span>
                            </div>
                            <div className="delivery-module-list">
                              {doneModules.map((module) => {
                                const submission = module.submission;
                                return (
                                  <div key={module.moduleKey} className="delivery-module-item">
                                    <div className="delivery-module-head">
                                      <div>
                                        <strong>{module.moduleTitle}</strong>
                                        <p>{submission.primaryRecipient || messages.common.values.notSet}</p>
                                      </div>
                                      <span className={`badge badge-${submissionStatusTone(module.status)}`}>
                                        {submissionStatusLabel(module.status, messages, copy.completedLabel)}
                                      </span>
                                    </div>

                                    <div className="delivery-module-meta">
                                      <span>{copy.createdAt} {formatDateTime(submission.createdAt, intlLocale)}</span>
                                      {submission.completedAt && <span>{copy.completedAt} {formatDateTime(submission.completedAt, intlLocale)}</span>}
                                      {submission.sentAt && <span>{copy.sentAt} {formatDateTime(submission.sentAt, intlLocale)}</span>}
                                      {submission.ccRecipients.length > 0 && <span>{messages.delivery.ccLabel} {submission.ccRecipients.join("; ")}</span>}
                                    </div>

                                    {submission.emailMessage && <p className="delivery-list-note text-sm text-sec">{submission.emailMessage}</p>}

                                    <div className="delivery-list-actions">
                                      <button className="btn btn-sm" onClick={() => void onDownloadPdf(module.actionSubmissionId)}>
                                        {copy.singleDownload}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">{copy.completedRosterEmpty}</div>
                )}
              </section>
            </div>
          )}

          <p className="text-xs text-sec">{copy.mailDraftHint}</p>
        </div>
      </div>
    </div>
  );
}
