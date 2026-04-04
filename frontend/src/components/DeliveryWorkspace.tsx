import { useMemo, useState } from "react";
import { getIntlLocale, getSortLocale, useLanguage } from "../features/language/LanguageProvider";
import type { AppMessages } from "../features/language/i18n";
import { formatDate, getDateTimestamp } from "../utils/date";
import { UiSelect } from "./UiSelect";
import type {
  BatchSendResponse,
  EmployeeProfile,
  SubmissionListItem,
  SubmissionResponse,
  TrainerSession,
  TrainingTemplateSummary
} from "../types/training";

interface DeliveryFormState {
  trainerName: string;
  trainerEmail: string;
  primaryRecipient: string;
}

interface Props {
  employees: EmployeeProfile[];
  templates: TrainingTemplateSummary[];
  selectedEmployee?: EmployeeProfile;
  selectedEmployeeId: string;
  selectedTemplate?: TrainingTemplateSummary | null;
  selectedTemplateId: string;
  recipientOptions: string[];
  form: DeliveryFormState;
  submissions: SubmissionListItem[];
  savingDraft: boolean;
  sendingBatch: boolean;
  lastResult: SubmissionResponse | BatchSendResponse | null;
  error: string | null;
  currentTrainer?: TrainerSession | null;
  onFieldChange: (field: keyof DeliveryFormState, value: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectTemplate: (id: string) => void;
  onSaveDraft: () => Promise<void>;
  onSendBatch: () => Promise<void>;
  onDownloadPdf: (id: string) => Promise<void>;
}

function isSubmissionResult(v: SubmissionResponse | BatchSendResponse): v is SubmissionResponse {
  return "pdfPath" in v;
}

function formatDateTime(value: string | undefined, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

function submissionStatusLabel(status: SubmissionListItem["sendStatus"], messages: AppMessages): string {
  switch (status) {
    case "sent": return messages.common.submissionStatus.sent;
    case "send_failed": return messages.common.submissionStatus.failed;
    default: return messages.common.submissionStatus.draft;
  }
}

function submissionStatusTone(status: SubmissionListItem["sendStatus"]): "success" | "error" | "warn" {
  switch (status) {
    case "sent": return "success";
    case "send_failed": return "error";
    default: return "warn";
  }
}

export function DeliveryWorkspace({
  employees,
  templates,
  selectedEmployee,
  selectedEmployeeId,
  selectedTemplate,
  selectedTemplateId,
  recipientOptions,
  form,
  submissions,
  savingDraft,
  sendingBatch,
  lastResult,
  error,
  currentTrainer,
  onFieldChange,
  onSelectEmployee,
  onSelectTemplate,
  onSaveDraft,
  onSendBatch,
  onDownloadPdf
}: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const sortLocale = getSortLocale(locale);
  const [listFilter, setListFilter] = useState<"all" | "draft" | "sent" | "send_failed">("draft");
  const [submissionSearch, setSubmissionSearch] = useState("");

  const pending = submissions.filter((submission) => submission.sendStatus === "draft");
  const sent = submissions.filter((submission) => submission.sendStatus === "sent");
  const failed = submissions.filter((submission) => submission.sendStatus === "send_failed");
  const readyItems = [
    { label: messages.delivery.readyItems.employee, value: selectedEmployee?.name ?? messages.common.values.notSelected, ready: Boolean(selectedEmployee) },
    { label: messages.delivery.readyItems.document, value: selectedTemplate?.title ?? messages.common.values.notSelected, ready: Boolean(selectedTemplate) },
    { label: messages.delivery.readyItems.recipient, value: form.primaryRecipient || messages.common.values.missing, ready: Boolean(form.primaryRecipient) }
  ];
  const readyCount = readyItems.filter((item) => item.ready).length;
  const sortedEmployees = useMemo(() => employees
    .filter((employee) => employee.role === "employee")
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, sortLocale)), [employees, sortLocale]);
  const employeeOptions = sortedEmployees.map((employee) => ({
    value: employee.id,
    label: `${employee.name} (${employee.team})`,
    description: employee.email
  }));
  const templateOptions = templates
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title, sortLocale))
    .map((template) => ({
      value: template.id,
      label: `${template.title} (${template.language})`,
      description: template.sourceFile
    }));
  const recipientSelectOptions = (recipientOptions ?? []).map((recipient) => ({
    value: recipient,
    label: recipient
  }));
  const visibleSubmissions = submissions
    .filter((submission) => listFilter === "all" || submission.sendStatus === listFilter)
    .filter((submission) => {
      const needle = submissionSearch.trim().toLowerCase();
      if (!needle) return true;
      return [submission.templateTitle, submission.primaryRecipient, submission.emailMessage, submission.employeeName]
        .some((value) => value.toLowerCase().includes(needle));
    })
    .sort((left, right) => getDateTimestamp(right.sentAt ?? right.createdAt) - getDateTimestamp(left.sentAt ?? left.createdAt));

  return (
    <div className="stack-lg">
      <section className="delivery-summary-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.delivery.contextEyebrow}</span>
              <h2>{messages.delivery.contextTitle}</h2>
            </div>
          </div>
          <div className="card-body delivery-context-grid">
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
              <label className="form-label" htmlFor="delivery-template-select">{messages.delivery.currentDocumentLabel}</label>
              <UiSelect
                id="delivery-template-select"
                value={selectedTemplateId}
                options={templateOptions}
                onChange={onSelectTemplate}
                placeholder={messages.delivery.currentDocumentFallback}
                searchable
                searchPlaceholder={messages.delivery.searchPlaceholder}
              />
            </div>

            <div className="delivery-context-item">
              <span className="delivery-context-label">{messages.delivery.currentEmployeeLabel}</span>
              <strong>{selectedEmployee?.name ?? messages.common.values.notSelected}</strong>
              <small>{selectedEmployee ? `${selectedEmployee.email} - ${selectedEmployee.team}` : messages.delivery.currentEmployeeHint}</small>
            </div>

            <div className="delivery-context-item">
              <span className="delivery-context-label">{messages.delivery.currentDocumentLabel}</span>
              <strong>{selectedTemplate?.title ?? messages.delivery.currentDocumentFallback}</strong>
              <small>{selectedTemplate?.sourceFile ?? messages.delivery.currentDocumentHint}</small>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.delivery.overviewEyebrow}</span>
              <h2>{messages.delivery.overviewTitle}</h2>
            </div>
          </div>
          <div className="card-body delivery-kpi-grid">
            <div className="delivery-kpi">
              <span className="delivery-kpi-label">{messages.delivery.smtpLabel}</span>
              <strong className="delivery-kpi-value">{messages.delivery.smtpReady}</strong>
              <small>{messages.delivery.smtpReadyDetail}</small>
            </div>
            <div className="delivery-kpi">
              <span className="delivery-kpi-label">{messages.delivery.checklistLabel}</span>
              <strong className="delivery-kpi-value">{readyCount}/{readyItems.length}</strong>
              <small>{readyCount === readyItems.length ? messages.delivery.checklistReady : messages.delivery.checklistPending}</small>
            </div>
            <div className="delivery-kpi">
              <span className="delivery-kpi-label">{messages.delivery.draftsLabel}</span>
              <strong className="delivery-kpi-value">{pending.length}</strong>
              <small>{messages.delivery.draftsDetail}</small>
            </div>
            <div className="delivery-kpi">
              <span className="delivery-kpi-label">{messages.delivery.issuesLabel}</span>
              <strong className="delivery-kpi-value">{failed.length}</strong>
              <small>{messages.delivery.issuesDetail}</small>
            </div>
          </div>
        </div>
      </section>

      <div className="delivery-main-grid">
        <div className="stack-lg">
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{messages.delivery.formEyebrow}</span>
                <h2>{messages.delivery.formTitle}</h2>
              </div>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{messages.delivery.trainerName}</label>
                  <div className="delivery-static-field">
                    {currentTrainer?.name ?? form.trainerName ?? messages.common.values.notSelected}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{messages.delivery.trainerEmail}</label>
                  <div className="delivery-static-field">
                    {currentTrainer?.email ?? form.trainerEmail ?? messages.common.values.notSelected}
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
                  <label className="form-label">{messages.delivery.additionalCc}</label>
                  <div className="delivery-static-field">
                    {selectedEmployee?.email || currentTrainer?.email || form.trainerEmail
                      ? [selectedEmployee?.email, currentTrainer?.email ?? form.trainerEmail].filter(Boolean).join(", ")
                      : messages.delivery.autoCcPending}
                  </div>
                  <p className="text-xs text-sec">{messages.delivery.autoCcHint}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="stack-lg">
          <div className="card delivery-action-card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{messages.delivery.checklistEyebrow}</span>
                <h2>{messages.delivery.checklistTitle}</h2>
              </div>
            </div>
            <div className="card-body stack-md">
              <div className="delivery-readiness-header">
                <div>
                  <strong>{readyCount}/{readyItems.length} {messages.delivery.pointsMet}</strong>
                  <p className="text-sm text-sec">{messages.delivery.checklistCopy}</p>
                </div>
                <span className={`badge badge-${readyCount === readyItems.length ? "success" : "warn"}`}>
                  {readyCount === readyItems.length ? messages.delivery.ready : messages.delivery.incomplete}
                </span>
              </div>

              <div className="checklist">
                {readyItems.map((item) => (
                  <div key={item.label} className="checklist-row">
                    <span className="label">{item.label}</span>
                    <span className={`value ${item.ready ? "ok" : "missing"}`}>{item.value}</span>
                  </div>
                ))}
              </div>

              {error && <p className="text-error text-sm">{error}</p>}
              <p className="text-xs text-sec">{messages.delivery.draftHint}</p>

              <div className="action-bar">
                <button className="btn" onClick={() => void onSaveDraft()} disabled={savingDraft || !selectedEmployee || !selectedTemplate}>
                  {savingDraft ? messages.delivery.saveBusy : messages.delivery.saveDraft}
                </button>
                <button className="btn btn-primary" onClick={() => void onSendBatch()} disabled={sendingBatch || pending.length === 0 || !selectedEmployee || !form.primaryRecipient}>
                  {sendingBatch ? messages.delivery.sending : messages.delivery.sendAllOpen}
                </button>
              </div>
            </div>
          </div>

          {lastResult && (
            <div className={`result-banner ${isSubmissionResult(lastResult) ? (lastResult.sendStatus === "send_failed" ? "warn" : "success") : (lastResult.emailDelivered ? "success" : "warn")}`}>
              <span>
                {isSubmissionResult(lastResult)
                  ? lastResult.emailMessage
                  : (`${lastResult.count} PDF(s) - ${lastResult.emailMessage}`)
                }
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header delivery-list-header">
          <div className="card-header-left">
            <span className="eyebrow">{messages.delivery.sendCenterEyebrow}</span>
            <h2>{messages.delivery.sendCenterTitle}</h2>
          </div>
        </div>
        <div className="card-body stack-md">
          <div className="delivery-filter-bar">
            <div className="delivery-filter-tabs" aria-label={messages.delivery.filterAria}>
              {[
                { id: "draft", label: `${messages.delivery.filterDrafts} (${pending.length})` },
                { id: "sent", label: `${messages.delivery.filterSent} (${sent.length})` },
                { id: "send_failed", label: `${messages.delivery.filterErrors} (${failed.length})` },
                { id: "all", label: `${messages.delivery.filterAll} (${submissions.length})` }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`delivery-filter-tab ${listFilter === item.id ? "active" : ""}`}
                  onClick={() => setListFilter(item.id as "all" | "draft" | "sent" | "send_failed")}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              className="form-input delivery-search-input"
              placeholder={messages.delivery.searchPlaceholder}
              value={submissionSearch}
              onChange={(event) => setSubmissionSearch(event.target.value)}
            />
          </div>

          {!visibleSubmissions.length ? (
            <div className="empty-state">{messages.delivery.noEntries}</div>
          ) : (
            <div className="delivery-list">
              {visibleSubmissions.map((submission) => (
                <div key={submission.id} className="delivery-list-item">
                  <div className="delivery-list-item-head">
                    <div className="queue-info">
                      <div className="queue-title">{submission.templateTitle}</div>
                      <div className="queue-sub">{submission.primaryRecipient || messages.common.values.notSet} - {submission.employeeName}</div>
                    </div>
                    <span className={`badge badge-${submissionStatusTone(submission.sendStatus)}`}>
                      {submissionStatusLabel(submission.sendStatus, messages)}
                    </span>
                  </div>

                  <div className="delivery-list-meta">
                    <span>{messages.delivery.createdAt} {formatDateTime(submission.createdAt, intlLocale)}</span>
                    <span>{submission.sendStatus === "sent" ? `${messages.delivery.sentAt} ${formatDateTime(submission.sentAt, intlLocale)}` : `${messages.delivery.statusLabel} ${messages.common.submissionStatus.draft}`}</span>
                    {submission.ccRecipients.length > 0 && <span>{messages.delivery.ccLabel} {submission.ccRecipients.join(", ")}</span>}
                  </div>

                  {submission.emailMessage && submission.sendStatus !== "sent" && (
                    <p className="delivery-list-note text-sm text-sec">{submission.emailMessage}</p>
                  )}

                  <div className="delivery-list-actions">
                    <button className="btn btn-sm" onClick={() => void onDownloadPdf(submission.id)}>
                      {messages.delivery.downloadItem}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}