import { useEffect, useMemo, useState } from "react";
import { getIntlLocale, getSortLocale, useLanguage } from "../features/language/LanguageProvider";
import type {
  EmployeeProfile,
  EmployeeTeam,
  ModuleRegistrationListItem,
  SubmissionListItem,
  TrainingTemplateSummary
} from "../types/training";
import { formatDate } from "../utils/date";
import { dedupeTemplatesByModule, getModuleKey, normalizeModuleTitle } from "../utils/moduleIdentity";
import { UiSelect } from "./UiSelect";

interface EffectiveRegistration extends ModuleRegistrationListItem {
  effectiveStatus: "pending" | "completed";
  effectiveCompletedAt?: string;
}

interface Props {
  employees: EmployeeProfile[];
  templates: TrainingTemplateSummary[];
  submissions: SubmissionListItem[];
  registrations: ModuleRegistrationListItem[];
  visibleTeams: EmployeeTeam[];
  lockedTeam: EmployeeTeam | null;
  hasPrivilegedAccess: boolean;
  selectedEmployeeId: string;
  selectedTemplateId: string;
  busy: boolean;
  message: string | null;
  error: string | null;
  variant?: "page" | "embedded";
  onSelectEmployee: (employeeId: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onCreateRegistration: (payload: { employeeId: string; templateIds: string[] }) => Promise<void>;
  onOpenDelivery: (employeeId: string, templateId?: string) => void;
}

function formatDateTime(value: string | undefined, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

function buildSubmissionCompletionMap(submissions: SubmissionListItem[]): Map<string, SubmissionListItem> {
  const matches = new Map<string, SubmissionListItem>();

  for (const submission of submissions) {
    if (submission.sendStatus !== "completed" && submission.sendStatus !== "sent") {
      continue;
    }

    const key = `${submission.employeeId}::${getModuleKey(submission.templateTitle)}`;
    const existing = matches.get(key);
    const nextStamp = new Date(submission.completedAt ?? submission.sentAt ?? submission.createdAt).getTime();
    const existingStamp = existing ? new Date(existing.completedAt ?? existing.sentAt ?? existing.createdAt).getTime() : 0;

    if (!existing || nextStamp >= existingStamp) {
      matches.set(key, submission);
    }
  }

  return matches;
}

export function RegistrationWorkspace({
  employees,
  templates,
  submissions,
  registrations,
  visibleTeams,
  lockedTeam,
  hasPrivilegedAccess,
  selectedEmployeeId,
  selectedTemplateId,
  busy,
  message,
  error,
  variant = "page",
  onSelectEmployee,
  onSelectTemplate,
  onCreateRegistration,
  onOpenDelivery
}: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const sortLocale = getSortLocale(locale);
  const [selectedTeam, setSelectedTeam] = useState<EmployeeTeam>(lockedTeam ?? visibleTeams[0] ?? "C-OPS");
  const [moduleFilter, setModuleFilter] = useState("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const copy = locale === "de"
    ? {
        heroEyebrow: "Anmeldung",
        heroTitle: "Mitarbeiter für Module anmelden",
        heroCopy: "Team auswählen, Mitarbeiter auswählen, Modul prüfen und direkt anmelden. Trainer und Admin sehen darunter die komplette Anmeldeliste im jeweiligen Scope.",
        formTitle: "Neue Anmeldung",
        formCopy: "Die Anmeldung bleibt offen, bis das Modul im OJT-Flow als abgeschlossen markiert wurde.",
        teamLabel: "Team",
        employeeLabel: "Mitarbeiter",
        moduleLabel: "Modul",
        modulesLabel: "Module",
        teamPlaceholder: "Team wählen",
        employeePlaceholder: "Mitarbeiter wählen",
        modulePlaceholder: "Modul wählen",
        noEmployees: "Keine Mitarbeiter für dieses Team verfügbar.",
        noModules: "Keine offenen Module mehr verfügbar.",
        addModule: "Modul hinzufügen",
        selectedModules: "Ausgewählte Module",
        selectedModulesEmpty: "Noch keine Module ausgewählt.",
        removeModule: "Entfernen",
        summaryTitle: "Prüfen vor dem Anmelden",
        summaryCopy: "Bitte kurz kontrollieren, damit nicht versehentlich das falsche Modul oder der falsche Mitarbeiter gewählt wird.",
        summaryTeam: "Team",
        summaryEmployee: "Mitarbeiter",
        summaryModule: "Module",
        submit: "Anmelden",
        submitBusy: "Wird gespeichert...",
        publicHint: "Diese Seite kann auch ohne Trainer-Login genutzt werden. Die Anmeldeliste sehen nur Trainer und Admin.",
        queueTitle: "Anmeldeliste",
        queueCopy: "Trainer sehen nur ihr Team. Admin sieht alle Teams. Sobald ein Modul im Delivery/OJT-Flow abgeschlossen ist, steht es hier automatisch auf abgeschlossen.",
        filterLabel: "Modulfilter",
        filterPlaceholder: "Alle Module",
        pendingCount: "Offen",
        completedCount: "Abgeschlossen",
        totalCount: "Gesamt",
        emptyQueue: "Keine Anmeldungen im aktuellen Filter.",
        registeredAt: "Angemeldet",
        completedAt: "Abgeschlossen",
        openDelivery: "Im Delivery öffnen",
        alreadyCompleted: "Bereits abgeschlossen",
        statusPending: "Angemeldet",
        statusCompleted: "Abgeschlossen",
        quickTitle: "Schnellblick",
        quickCopy: "Nutze den Modulfilter, um direkt alle Mitarbeiter für dasselbe Modul zu sehen und nacheinander zu bearbeiten."
      }
    : {
        heroEyebrow: "Registration",
        heroTitle: "Register employees for modules",
        heroCopy: "Pick a team, select the employee, confirm the module, and register it. Trainers and admins get the full queue below in their current scope.",
        formTitle: "New registration",
        formCopy: "The registration stays open until the module has been marked as completed in the OJT flow.",
        teamLabel: "Team",
        employeeLabel: "Employee",
        moduleLabel: "Module",
        modulesLabel: "Modules",
        teamPlaceholder: "Choose team",
        employeePlaceholder: "Choose employee",
        modulePlaceholder: "Choose module",
        noEmployees: "No employees available for this team.",
        noModules: "No open modules remain for this employee.",
        addModule: "Add module",
        selectedModules: "Selected modules",
        selectedModulesEmpty: "No modules selected yet.",
        removeModule: "Remove",
        summaryTitle: "Review before saving",
        summaryCopy: "Double-check the team, employee, and module selection before registering it.",
        summaryTeam: "Team",
        summaryEmployee: "Employee",
        summaryModule: "Modules",
        submit: "Register",
        submitBusy: "Saving...",
        publicHint: "This page can be used without trainer login. Only trainers and admins can see the queue list.",
        queueTitle: "Registration queue",
        queueCopy: "Trainers only see their team. Admin sees every team. As soon as a module is completed in the delivery/OJT flow, it is marked completed here automatically.",
        filterLabel: "Module filter",
        filterPlaceholder: "All modules",
        pendingCount: "Open",
        completedCount: "Completed",
        totalCount: "Total",
        emptyQueue: "No registrations match the current filter.",
        registeredAt: "Registered",
        completedAt: "Completed",
        openDelivery: "Open in delivery",
        alreadyCompleted: "Already completed",
        statusPending: "Registered",
        statusCompleted: "Completed",
        quickTitle: "Quick focus",
        quickCopy: "Use the module filter to pull up everyone registered for the same module and process them one after another."
      };

  useEffect(() => {
    if (lockedTeam) {
      setSelectedTeam(lockedTeam);
    }
  }, [lockedTeam]);

  useEffect(() => {
    setSelectedModuleIds([]);
    onSelectTemplate("");
  }, [selectedEmployeeId, selectedTeam, onSelectTemplate]);

  const employeeOptions = useMemo(() => employees
    .filter((employee) => employee.role === "employee" && employee.team === selectedTeam)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, sortLocale))
    .map((employee) => ({
      value: employee.id,
      label: employee.name,
      description: employee.email
    })), [employees, selectedTeam, sortLocale]);

  const submissionCompletionMap = useMemo(() => buildSubmissionCompletionMap(submissions), [submissions]);

  const effectiveRegistrations = useMemo<EffectiveRegistration[]>(() => registrations
    .map((registration) => {
      const completion = submissionCompletionMap.get(`${registration.employeeId}::${registration.moduleKey}`);

      return {
        ...registration,
        effectiveStatus: completion ? "completed" : registration.status,
        effectiveCompletedAt: completion?.completedAt ?? completion?.sentAt ?? registration.completedAt
      };
    })
    .sort((left, right) => {
      if (left.effectiveStatus !== right.effectiveStatus) {
        return left.effectiveStatus === "pending" ? -1 : 1;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }), [registrations, submissionCompletionMap]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId && employee.role === "employee") ?? null,
    [employees, selectedEmployeeId]
  );

  useEffect(() => {
    if (selectedEmployee?.team && selectedEmployee.team !== selectedTeam && !lockedTeam) {
      setSelectedTeam(selectedEmployee.team);
    }
  }, [lockedTeam, selectedEmployee?.team, selectedTeam]);

  const registeredModuleKeysForEmployee = useMemo(() => {
    if (!selectedEmployeeId) {
      return new Set<string>();
    }

    const keys = new Set<string>();

    for (const registration of effectiveRegistrations) {
      if (registration.employeeId === selectedEmployeeId) {
        keys.add(registration.moduleKey);
      }
    }

    for (const key of submissionCompletionMap.keys()) {
      if (key.startsWith(`${selectedEmployeeId}::`)) {
        keys.add(key.split("::")[1] ?? "");
      }
    }

    return keys;
  }, [effectiveRegistrations, selectedEmployeeId, submissionCompletionMap]);

  const moduleTemplates = useMemo(() => {
    const preferredLanguage = locale === "de" ? "German" : "English";
    return dedupeTemplatesByModule(
      templates.filter((template) => template.team === selectedTeam),
      preferredLanguage
    );
  }, [locale, selectedTeam, templates]);

  const moduleOptions = useMemo(() => moduleTemplates
    .filter((template) => !registeredModuleKeysForEmployee.has(getModuleKey(template.title)) && !selectedModuleIds.includes(template.id))
    .slice()
    .sort((left, right) => normalizeModuleTitle(left.title).localeCompare(normalizeModuleTitle(right.title), sortLocale))
    .map((template) => ({
      value: template.id,
      label: normalizeModuleTitle(template.title),
      description: `${template.language} · ${template.sourceFile}`
    })), [moduleTemplates, registeredModuleKeysForEmployee, selectedModuleIds, sortLocale]);

  useEffect(() => {
    if (selectedEmployeeId && !employeeOptions.some((option) => option.value === selectedEmployeeId)) {
      onSelectEmployee("");
      onSelectTemplate("");
    }
  }, [employeeOptions, onSelectEmployee, onSelectTemplate, selectedEmployeeId]);

  useEffect(() => {
    if (selectedTemplateId && !moduleOptions.some((option) => option.value === selectedTemplateId)) {
      onSelectTemplate("");
    }
  }, [moduleOptions, onSelectTemplate, selectedTemplateId]);

  const selectedModules = useMemo(() => selectedModuleIds
    .map((templateId) => moduleTemplates.find((template) => template.id === templateId) ?? null)
    .filter((template): template is TrainingTemplateSummary => Boolean(template)), [moduleTemplates, selectedModuleIds]);

  const listModuleOptions = useMemo(() => {
    const seen = new Set<string>();

    return effectiveRegistrations
      .map((registration) => ({
        value: registration.moduleKey,
        label: registration.moduleTitle
      }))
      .filter((option) => {
        if (seen.has(option.value)) {
          return false;
        }

        seen.add(option.value);
        return true;
      })
      .sort((left, right) => left.label.localeCompare(right.label, sortLocale));
  }, [effectiveRegistrations, sortLocale]);

  const filteredRegistrations = useMemo(() => effectiveRegistrations.filter((registration) => {
    if (!hasPrivilegedAccess) {
      return false;
    }

    return !moduleFilter || registration.moduleKey === moduleFilter;
  }), [effectiveRegistrations, hasPrivilegedAccess, moduleFilter]);

  const queueCounts = useMemo(() => ({
    pending: filteredRegistrations.filter((item) => item.effectiveStatus === "pending").length,
    completed: filteredRegistrations.filter((item) => item.effectiveStatus === "completed").length,
    total: filteredRegistrations.length
  }), [filteredRegistrations]);

  async function handleSubmit(): Promise<void> {
    if (!selectedEmployeeId || !selectedModuleIds.length) {
      return;
    }

    await onCreateRegistration({ employeeId: selectedEmployeeId, templateIds: selectedModuleIds });
    setSelectedModuleIds([]);
    onSelectTemplate("");
  }

  function handleAddModule(): void {
    if (!selectedTemplateId || selectedModuleIds.includes(selectedTemplateId)) {
      return;
    }

    setSelectedModuleIds((current) => [...current, selectedTemplateId]);
    onSelectTemplate("");
  }

  function handleRemoveModule(templateId: string): void {
    setSelectedModuleIds((current) => current.filter((currentTemplateId) => currentTemplateId !== templateId));
  }

  return (
    <div className={`registration-page ${variant === "embedded" ? "registration-page-embedded" : ""}`}>
      {variant === "page" && (
        <section className="card registration-hero-card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{copy.heroEyebrow}</span>
              <h3>{copy.heroTitle}</h3>
            </div>
          </div>
          <div className="card-body registration-hero-body">
            <p>{copy.heroCopy}</p>
            {!hasPrivilegedAccess && <small>{copy.publicHint}</small>}
          </div>
        </section>
      )}

      <div className="registration-grid">
        <section className="card registration-form-card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.shell.viewTitles.training}</span>
              <h3>{copy.formTitle}</h3>
            </div>
          </div>
          <div className="card-body registration-form-body">
            <p className="text-sec registration-form-copy">{copy.formCopy}</p>

            <div className="form-grid registration-form-grid">
              <label>
                <span className="label">{copy.teamLabel}</span>
                <UiSelect
                  value={selectedTeam}
                  options={visibleTeams.map((team) => ({ value: team, label: team }))}
                  onChange={(team) => {
                    setSelectedTeam(team as EmployeeTeam);
                    onSelectEmployee("");
                    onSelectTemplate("");
                  }}
                  placeholder={copy.teamPlaceholder}
                  disabled={Boolean(lockedTeam)}
                />
              </label>

              <label>
                <span className="label">{copy.employeeLabel}</span>
                <UiSelect
                  value={selectedEmployeeId}
                  options={employeeOptions}
                  onChange={(employeeId) => {
                    onSelectEmployee(employeeId);
                    onSelectTemplate("");
                  }}
                  placeholder={copy.employeePlaceholder}
                  searchable
                  searchPlaceholder={copy.employeePlaceholder}
                  disabled={!employeeOptions.length}
                />
                {!employeeOptions.length && <small className="text-sec">{copy.noEmployees}</small>}
              </label>

              <label>
                <span className="label">{copy.moduleLabel}</span>
                <UiSelect
                  value={selectedTemplateId}
                  options={moduleOptions}
                  onChange={onSelectTemplate}
                  placeholder={copy.modulePlaceholder}
                  searchable
                  searchPlaceholder={copy.modulePlaceholder}
                  disabled={!selectedEmployeeId || !moduleOptions.length}
                />
                <div className="registration-module-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!selectedTemplateId}
                    onClick={handleAddModule}
                  >
                    {copy.addModule}
                  </button>
                </div>
                {selectedEmployeeId && !moduleOptions.length && <small className="text-sec">{copy.noModules}</small>}
              </label>
            </div>

            <div className="registration-selected-card">
              <div className="registration-selected-head">
                <span className="label">{copy.selectedModules}</span>
              </div>

              {selectedModules.length ? (
                <div className="registration-selected-list">
                  {selectedModules.map((module) => (
                    <div key={module.id} className="registration-selected-item">
                      <div>
                        <strong>{normalizeModuleTitle(module.title)}</strong>
                        <small>{module.language}</small>
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={() => handleRemoveModule(module.id)}>
                        {copy.removeModule}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="registration-selected-empty">{copy.selectedModulesEmpty}</div>
              )}
            </div>

            <div className="registration-review-card">
              <div className="registration-review-head">
                <div>
                  <span className="eyebrow">{copy.summaryTitle}</span>
                  <h4>{copy.summaryTitle}</h4>
                </div>
                <p>{copy.summaryCopy}</p>
              </div>

              <div className="registration-review-grid">
                <div className="registration-review-item">
                  <span>{copy.summaryTeam}</span>
                  <strong>{selectedTeam || messages.common.values.notSelected}</strong>
                </div>
                <div className="registration-review-item">
                  <span>{copy.summaryEmployee}</span>
                  <strong>{selectedEmployee?.name ?? messages.common.values.notSelected}</strong>
                </div>
                <div className="registration-review-item registration-review-item-wide">
                  <span>{copy.summaryModule}</span>
                  <strong>
                    {selectedModules.length
                      ? selectedModules.map((module) => normalizeModuleTitle(module.title)).join(", ")
                      : messages.common.values.notSelected}
                  </strong>
                </div>
              </div>

              <div className="registration-review-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { void handleSubmit(); }}
                  disabled={!selectedEmployeeId || !selectedModuleIds.length || busy}
                >
                  {busy ? copy.submitBusy : copy.submit}
                </button>
                {message && <span className="text-success">{message}</span>}
                {error && <span className="text-error">{error}</span>}
              </div>
            </div>
          </div>
        </section>

        {hasPrivilegedAccess && (
          <aside className="card registration-insight-card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{copy.quickTitle}</span>
                <h3>{copy.queueTitle}</h3>
              </div>
            </div>
            <div className="card-body registration-insight-body">
              <p>{copy.quickCopy}</p>
              <div className="registration-stat-grid">
                <div className="registration-stat-card">
                  <span>{copy.pendingCount}</span>
                  <strong>{queueCounts.pending}</strong>
                </div>
                <div className="registration-stat-card">
                  <span>{copy.completedCount}</span>
                  <strong>{queueCounts.completed}</strong>
                </div>
                <div className="registration-stat-card">
                  <span>{copy.totalCount}</span>
                  <strong>{queueCounts.total}</strong>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {hasPrivilegedAccess && (
        <section className="card registration-queue-card">
          <div className="card-header registration-queue-head">
            <div className="card-header-left">
              <span className="eyebrow">{copy.queueTitle}</span>
              <h3>{copy.queueTitle}</h3>
            </div>
            <div className="registration-queue-filter">
              <label>
                <span className="label">{copy.filterLabel}</span>
                <UiSelect
                  value={moduleFilter}
                  options={listModuleOptions}
                  onChange={setModuleFilter}
                  placeholder={copy.filterPlaceholder}
                />
              </label>
            </div>
          </div>
          <div className="card-body registration-queue-body">
            <p className="text-sec registration-queue-copy">{copy.queueCopy}</p>

            {!filteredRegistrations.length ? (
              <div className="empty-state">{copy.emptyQueue}</div>
            ) : (
              <div className="registration-list">
                {filteredRegistrations.map((registration) => (
                  <article key={registration.id} className={`registration-row ${registration.effectiveStatus === "completed" ? "is-completed" : ""}`}>
                    <div className="registration-row-main">
                      <div className="registration-row-head">
                        <div>
                          <h4>{registration.employeeName}</h4>
                          <p>{registration.employeeEmail}</p>
                        </div>
                        <div className="employee-meta-badges">
                          <span className={`badge badge-${registration.effectiveStatus === "completed" ? "success" : "warn"}`}>
                            {registration.effectiveStatus === "completed" ? copy.statusCompleted : copy.statusPending}
                          </span>
                          <span className="badge badge-neutral">{registration.team}</span>
                        </div>
                      </div>

                      <div className="registration-row-module">{registration.moduleTitle}</div>

                      <div className="registration-row-meta">
                        <span>{copy.registeredAt}: {formatDateTime(registration.createdAt, intlLocale)}</span>
                        <span>{copy.completedAt}: {registration.effectiveCompletedAt ? formatDateTime(registration.effectiveCompletedAt, intlLocale) : messages.common.values.notSet}</span>
                      </div>
                    </div>

                    <div className="registration-row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onOpenDelivery(registration.employeeId, registration.templateId)}
                      >
                        {registration.effectiveStatus === "completed" ? copy.alreadyCompleted : copy.openDelivery}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}