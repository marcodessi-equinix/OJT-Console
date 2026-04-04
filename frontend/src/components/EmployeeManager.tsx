import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { getSortLocale, useLanguage } from "../features/language/LanguageProvider";
import type { AppMessages } from "../features/language/i18n";
import type { EmployeeProfile, EmployeeRole, EmployeeTeam, SubmissionListItem, TrainingTemplateSummary } from "../types/training";
import { buildEmployeeProgress, type EmployeeProgressStatus, type EmployeeProgressSummary } from "../utils/employeeProgress";
import { UiSelect } from "./UiSelect";

interface Props {
  employees: EmployeeProfile[];
  templates: TrainingTemplateSummary[];
  submissions: SubmissionListItem[];
  canManage: boolean;
  canOpenDelivery: boolean;
  selectedEmployeeId: string;
  visibleTeams: EmployeeTeam[];
  lockedTeam?: EmployeeTeam | null;
  onSelect: (id: string) => void;
  onOpenDelivery: (id: string) => void;
  onCreate: (payload: { firstName: string; lastName: string; email: string; role: EmployeeRole; team: EmployeeTeam }) => Promise<void>;
  onUpdate: (id: string, payload: { firstName?: string; lastName?: string; email?: string; role?: EmployeeRole; team?: EmployeeTeam }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulkImport: (items: Array<{ firstName?: string; lastName?: string; name?: string; email: string; role?: EmployeeRole; team?: EmployeeTeam }>) => Promise<{ created: number; skipped: number }>;
}

type EmployeeCategoryFilter = "all" | "trainer" | EmployeeTeam;

const LOGO_TRAINER = "/eqx_digital-learning-badges_Instructor_SME.png";
const LOGO_COPS = "/eqx_digital-learning-badges_CustomerOps_Bronze.png";
const LOGO_FOPS = "/eqx_digital-learning-badges_CriticalFacilities_Bronze.png";

function avatarSrc(role: EmployeeRole, team: EmployeeTeam): string {
  if (role === "trainer") return LOGO_TRAINER;
  return team === "F-OPS" ? LOGO_FOPS : LOGO_COPS;
}

function parseRole(value: unknown): EmployeeRole {
  return String(value ?? "").trim().toLowerCase() === "trainer" ? "trainer" : "employee";
}

function parseTeam(value: unknown): EmployeeTeam {
  return String(value ?? "").trim().toUpperCase() === "F-OPS" ? "F-OPS" : "C-OPS";
}

function readCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function splitFullName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(" ");
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function statusLabel(status: EmployeeProgressStatus, messages: AppMessages): string {
  switch (status) {
    case "complete": return messages.common.trainingStatus.complete;
    case "blocked": return messages.common.trainingStatus.blocked;
    case "ready": return messages.common.submissionStatus.draft;
    case "in_progress": return messages.common.trainingStatus.inProgress;
    default: return messages.common.trainingStatus.notStarted;
  }
}

function statusTone(status: EmployeeProgressStatus): "success" | "error" | "warn" | "primary" | "default" {
  switch (status) {
    case "complete": return "success";
    case "blocked": return "error";
    case "ready": return "warn";
    case "in_progress": return "primary";
    default: return "default";
  }
}

function statusRank(status: EmployeeProgressStatus): number {
  switch (status) {
    case "blocked": return 0;
    case "ready": return 1;
    case "in_progress": return 2;
    case "not_started": return 3;
    case "complete": return 4;
    default: return 5;
  }
}

export function EmployeeManager({
  employees,
  templates,
  submissions,
  canManage,
  canOpenDelivery,
  selectedEmployeeId,
  visibleTeams,
  lockedTeam,
  onSelect,
  onOpenDelivery,
  onCreate,
  onUpdate,
  onDelete,
  onBulkImport
}: Props) {
  const { locale, messages } = useLanguage();
  const sortLocale = getSortLocale(locale);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | EmployeeRole>("all");
  const [teamFilter, setTeamFilter] = useState<"all" | EmployeeTeam>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeProgressStatus>("all");
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "status" | "progress_desc">("name_asc");
  const [showCreate, setShowCreate] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<EmployeeRole>("employee");
  const [createTeam, setCreateTeam] = useState<EmployeeTeam>("C-OPS");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<EmployeeRole>("employee");
  const [editTeam, setEditTeam] = useState<EmployeeTeam>("C-OPS");
  const [saving, setSaving] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeHeaderFilter: EmployeeCategoryFilter = roleFilter === "trainer"
    ? "trainer"
    : lockedTeam ?? (teamFilter === "F-OPS"
      ? "F-OPS"
      : teamFilter === "C-OPS"
        ? "C-OPS"
        : "all");

  const allRows = employees.map((employee) => ({
    employee,
    progressSummary: buildEmployeeProgress(employee, templates, submissions)
  }));

  const filteredRows = allRows
    .filter(({ employee, progressSummary }) => {
      const needle = search.trim().toLowerCase();
      const matchesSearch =
        !needle
        || employee.firstName.toLowerCase().includes(needle)
        || employee.lastName.toLowerCase().includes(needle)
        || employee.name.toLowerCase().includes(needle)
        || employee.email.toLowerCase().includes(needle);
      const matchesRole = roleFilter === "all" || employee.role === roleFilter;
      const matchesTeam = teamFilter === "all" || employee.team === teamFilter;
      const matchesStatus =
        statusFilter === "all"
        || (employee.role === "employee" && progressSummary?.status === statusFilter);
      return matchesSearch && matchesRole && matchesTeam && matchesStatus;
    })
    .sort((left, right) => {
      if (sortBy === "name_desc") return right.employee.name.localeCompare(left.employee.name, sortLocale);
      if (sortBy === "status") {
        const leftRank = left.progressSummary ? statusRank(left.progressSummary.status) : 6;
        const rightRank = right.progressSummary ? statusRank(right.progressSummary.status) : 6;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      if (sortBy === "progress_desc") {
        const leftProgress = left.progressSummary ? left.progressSummary.documentedModules : -1;
        const rightProgress = right.progressSummary ? right.progressSummary.documentedModules : -1;
        if (leftProgress !== rightProgress) return rightProgress - leftProgress;
      }
      return left.employee.name.localeCompare(right.employee.name, sortLocale);
    });

  const trainerCount = employees.filter((employee) => employee.role === "trainer").length;
  const teamCounts = {
    "C-OPS": employees.filter((employee) => employee.role === "employee" && employee.team === "C-OPS").length,
    "F-OPS": employees.filter((employee) => employee.role === "employee" && employee.team === "F-OPS").length
  };
  const filteredTrainerCount = filteredRows.filter((row) => row.employee.role === "trainer").length;
  const filteredTeamCounts = {
    "C-OPS": filteredRows.filter((row) => row.employee.role === "employee" && row.employee.team === "C-OPS").length,
    "F-OPS": filteredRows.filter((row) => row.employee.role === "employee" && row.employee.team === "F-OPS").length
  };
  const completedVisibleCount = filteredRows.filter((row) => row.progressSummary?.status === "complete").length;
  const activeVisibleCount = filteredRows.filter((row) => row.progressSummary && row.progressSummary.status !== "not_started").length;
  const editorOpen = showCreate || Boolean(editingId);
  const isCreateMode = showCreate && !editingId;
  const activeEditorRole = isCreateMode ? createRole : editRole;
  const activeEditorBusy = isCreateMode ? creating : saving;
  const listLogo = activeHeaderFilter === "trainer"
    ? LOGO_TRAINER
    : activeHeaderFilter === "F-OPS"
      ? LOGO_FOPS
      : LOGO_COPS;
  const visibleTeamSummary = visibleTeams
    .map((team) => `${filteredTeamCounts[team]} ${team}`)
    .join(" - ");

  function resetCreateForm(): void {
    setCreateFirstName("");
    setCreateLastName("");
    setCreateEmail("");
    setCreateRole("employee");
    setCreateTeam(lockedTeam ?? "C-OPS");
  }

  function closeEditor(): void {
    setShowCreate(false);
    setEditingId(null);
  }

  function openCreate(): void {
    closeEditor();
    resetCreateForm();
    setShowCreate(true);
  }

  function applyHeaderFilter(nextFilter: EmployeeCategoryFilter): void {
    const shouldReset = nextFilter === "all" || activeHeaderFilter === nextFilter;

    if (shouldReset) {
      setRoleFilter("all");
      setTeamFilter("all");
      setStatusFilter("all");
      return;
    }

    if (nextFilter === "trainer") {
      setRoleFilter("trainer");
      setTeamFilter("all");
      setStatusFilter("all");
      return;
    }

    setRoleFilter("employee");
    setTeamFilter(nextFilter);
    setStatusFilter("all");
  }

  const roleFilterOptions = [
    { value: "all", label: messages.employees.allRoles },
    { value: "trainer", label: messages.common.roles.trainer },
    { value: "employee", label: messages.common.roles.employee }
  ];
  const teamFilterOptions = [
    { value: "all", label: messages.employees.allTeams },
    { value: "C-OPS", label: "C-OPS" },
    { value: "F-OPS", label: "F-OPS" }
  ].filter((option) => option.value === "all" || visibleTeams.includes(option.value as EmployeeTeam));
  const statusFilterOptions = [
    { value: "all", label: messages.employees.allStatuses },
    { value: "not_started", label: messages.common.trainingStatus.notStarted },
    { value: "in_progress", label: messages.common.trainingStatus.inProgress },
    { value: "ready", label: messages.common.submissionStatus.draft },
    { value: "complete", label: messages.common.trainingStatus.complete },
    { value: "blocked", label: messages.common.trainingStatus.blocked }
  ];
  const sortOptions = [
    { value: "name_asc", label: messages.employees.sortNameAsc },
    { value: "name_desc", label: messages.employees.sortNameDesc },
    { value: "status", label: messages.employees.sortStatus },
    { value: "progress_desc", label: messages.employees.sortProgress }
  ];
  const editorRoleOptions = [
    { value: "employee", label: messages.common.roles.employee },
    { value: "trainer", label: messages.common.roles.trainer }
  ];
  const editorTeamOptions = [
    { value: "C-OPS", label: "C-OPS" },
    { value: "F-OPS", label: "F-OPS" }
  ].filter((option) => !lockedTeam || option.value === lockedTeam);

  async function handleCreate() {
    if (!createFirstName.trim() || !createLastName.trim() || !createEmail.trim()) return;
    setCreating(true);
    try {
      await onCreate({
        firstName: createFirstName.trim(),
        lastName: createLastName.trim(),
        email: createEmail.trim(),
        role: createRole,
        team: createTeam
      });
      resetCreateForm();
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(employee: EmployeeProfile) {
    setShowCreate(false);
    setEditingId(employee.id);
    setEditFirstName(employee.firstName);
    setEditLastName(employee.lastName);
    setEditEmail(employee.email);
    setEditRole(employee.role);
    setEditTeam(employee.team);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      await onUpdate(editingId, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        email: editEmail.trim(),
        role: editRole,
        team: editTeam
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(messages.employees.confirmDelete)) return;
    await onDelete(id);
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const items: Array<{ firstName?: string; lastName?: string; name?: string; email: string; role?: EmployeeRole; team?: EmployeeTeam }> = [];

      for (const row of rows) {
        const firstName = readCell(row, ["Vorname", "First Name", "FirstName", "firstName", "firstname"]);
        const lastName = readCell(row, ["Nachname", "Last Name", "LastName", "lastName", "lastname"]);
        const name = readCell(row, ["Name", "Full Name", "fullName"]);
        const email = readCell(row, ["E-Mail", "Email", "email"]);
        const role = parseRole(readCell(row, ["Rolle", "Role", "role"]));
        const team = parseTeam(readCell(row, ["Team", "team"]));

        if (!email) continue;

        if (firstName && lastName) {
          items.push({ firstName, lastName, email, role, team });
          continue;
        }

        if (name) {
          const splitName = splitFullName(name);
          items.push({ firstName: splitName.firstName, lastName: splitName.lastName, name, email, role, team });
        }
      }

      if (!items.length) {
        setImportResult(messages.employees.importNoValidEntries);
        return;
      }

      const result = await onBulkImport(items);
      setImportResult(
        locale === "de"
          ? `${result.created} angelegt, ${result.skipped} uebersprungen.`
          : `${result.created} created, ${result.skipped} skipped.`
      );
    } catch {
      setImportResult(messages.employees.importFailed);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function exportWorkbook() {
    const rows = employees.map((employee) => ({
      [messages.employees.firstName]: employee.firstName,
      [messages.employees.lastName]: employee.lastName,
      Name: employee.name,
      [messages.employees.email]: employee.email,
      [messages.employees.role]: employee.role === "trainer" ? "trainer" : "employee",
      [messages.employees.team]: employee.team
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, messages.employees.sheetName);
    XLSX.writeFile(workbook, messages.employees.fileName);
  }

  function renderRow(employee: EmployeeProfile, progressSummary: EmployeeProgressSummary | null) {
    const isSelected = selectedEmployeeId === employee.id;
    const progressTone = progressSummary ? statusTone(progressSummary.status) : "default";
    const teamBadgeClass = employee.team === "F-OPS" ? "badge-team-fops" : "badge-team-cops";
    const progressCopy = locale === "de"
      ? `${progressSummary?.documentedModules ?? 0}/${progressSummary?.availableModules ?? 0} Module erfasst - ${progressSummary?.pendingDrafts ?? 0} Entwuerfe offen - ${progressSummary?.sentModules ?? 0} versendet`
      : `${progressSummary?.documentedModules ?? 0}/${progressSummary?.availableModules ?? 0} modules recorded - ${progressSummary?.pendingDrafts ?? 0} drafts open - ${progressSummary?.sentModules ?? 0} sent`;

    return (
      <div
        key={employee.id}
        className={`employee-row${isSelected ? " active" : ""}`}
        onClick={() => onSelect(employee.id)}
      >
        <img
          src={avatarSrc(employee.role, employee.team)}
          alt={employee.role === "trainer" ? messages.common.roles.trainer : employee.team}
          className="employee-avatar employee-avatar-logo"
        />
        <div className="employee-info">
          <div className="employee-row-head">
            <div>
              <div className="employee-name">{employee.name}</div>
              <div className="employee-email">{employee.email}</div>
            </div>
            <div className="employee-meta-badges">
              <span className={`badge ${teamBadgeClass}`}>{employee.team}</span>
              <span className="badge badge-default">{employee.role === "trainer" ? messages.common.roles.trainer : messages.common.roles.employee}</span>
              {employee.role === "trainer" && <span className={`badge ${employee.hasPin ? "badge-success" : "badge-warn"}`}>{employee.hasPin ? messages.employees.pinSet : messages.employees.pinMissing}</span>}
              {progressSummary && <span className={`badge badge-${progressTone}`}>{statusLabel(progressSummary.status, messages)}</span>}
            </div>
          </div>
          {progressSummary ? (
            <>
              <div className="employee-progress-copy">
                <span className="employee-progress-text">{progressCopy}</span>
              </div>
              <progress
                className={`dashboard-meter dashboard-meter-${progressTone} employee-progress-meter`}
                value={progressSummary.documentedModules}
                max={Math.max(progressSummary.availableModules, 1)}
              />
            </>
          ) : (
            <div className="employee-progress-copy">
              <span className="employee-progress-text">{messages.employees.trainerProfileCopy}</span>
            </div>
          )}
        </div>
        <div className="emp-row-actions">
          {canOpenDelivery && employee.role === "employee" && (
            <button className="btn btn-sm btn-primary" onClick={(event) => { event.stopPropagation(); onOpenDelivery(employee.id); }}>
              {messages.employees.deliveryButton}
            </button>
          )}
          {canManage && (
            <>
              <button className="btn btn-sm" onClick={(event) => { event.stopPropagation(); onSelect(employee.id); startEdit(employee); }}>
                {messages.common.actions.edit}
              </button>
              <button className="btn btn-sm btn-danger" onClick={(event) => { event.stopPropagation(); void handleDelete(employee.id); }}>
                {messages.common.actions.delete}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="emp-page">
      <div className="emp-top-grid">
        <div className="card">
          <div className="card-body emp-top-stats">
            <button type="button" className={`emp-stat-button${activeHeaderFilter === "trainer" ? " active" : ""}`} onClick={() => applyHeaderFilter("trainer")}>
              <div className="emp-stat">
                <img src={LOGO_TRAINER} alt={messages.common.roles.trainer} className="emp-stat-logo" />
                <div className="emp-stat-copy">
                  <div className="emp-stat-value">{trainerCount}</div>
                  <div className="emp-stat-label">{messages.common.roles.trainer}</div>
                </div>
              </div>
            </button>
            {visibleTeams.map((team) => (
              <button key={team} type="button" className={`emp-stat-button${activeHeaderFilter === team ? " active" : ""}`} onClick={() => applyHeaderFilter(team)}>
                <div className="emp-stat">
                  <img src={team === "F-OPS" ? LOGO_FOPS : LOGO_COPS} alt={team} className="emp-stat-logo" />
                  <div className="emp-stat-copy">
                    <div className="emp-stat-value">{teamCounts[team]}</div>
                    <div className="emp-stat-label">{team}</div>
                  </div>
                </div>
              </button>
            ))}
            {!lockedTeam && (
              <button type="button" className={`emp-stat-button${activeHeaderFilter === "all" ? " active" : ""}`} onClick={() => applyHeaderFilter("all")}>
                <div className="emp-stat emp-stat-total">
                  <div className="emp-stat-copy">
                    <div className="emp-stat-value">{employees.length}</div>
                    <div className="emp-stat-label">{locale === "de" ? "Gesamt" : "Total"}</div>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {canManage && (
          <div className="card">
            <div className="card-body emp-file-actions">
              <button className="btn btn-primary btn-sm" onClick={openCreate}>{messages.employees.createButton}</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="emp-file-input" title={messages.employees.importFileTitle} onChange={handleFileImport} />
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>{messages.employees.importButton}</button>
              <button className="btn btn-sm" onClick={exportWorkbook}>{messages.employees.exportButton}</button>
              {importResult && <span className="text-sm text-sec">{importResult}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="emp-searchbar">
        <input
          type="text"
          className="form-input emp-search-input"
          placeholder={messages.employees.searchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          title={messages.employees.searchTitle}
        />
        <UiSelect
          className="emp-filter-select"
          value={roleFilter}
          options={roleFilterOptions}
          onChange={(value) => {
            const nextRole = value as "all" | EmployeeRole;
            setRoleFilter(nextRole);
            if (nextRole === "trainer") setStatusFilter("all");
          }}
          title={messages.employees.roleFilterTitle}
        />
        {!lockedTeam && (
          <UiSelect
            className="emp-filter-select"
            value={teamFilter}
            options={teamFilterOptions}
            onChange={(value) => setTeamFilter(value as "all" | EmployeeTeam)}
            title={messages.employees.teamFilterTitle}
          />
        )}
        <UiSelect
          className="emp-filter-select"
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(value) => setStatusFilter(value as "all" | EmployeeProgressStatus)}
          title={messages.employees.statusFilterTitle}
          disabled={roleFilter === "trainer"}
        />
        <UiSelect
          className="emp-filter-select"
          value={sortBy}
          options={sortOptions}
          onChange={(value) => setSortBy(value as "name_asc" | "name_desc" | "status" | "progress_desc")}
          title={messages.employees.sortTitle}
        />
      </div>

      {editorOpen && canManage && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{isCreateMode ? messages.employees.createEyebrow : messages.employees.editEyebrow}</span>
              <h2 className="emp-edit-title">{isCreateMode ? messages.employees.createTitle : messages.employees.editTitle}</h2>
            </div>
            <button className="btn btn-sm" onClick={closeEditor}>{messages.common.actions.cancel}</button>
          </div>
          <div className="card-body">
            <div className="emp-edit-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="employee-editor-first-name">{messages.employees.firstName}</label>
                <input id="employee-editor-first-name" className="form-input" value={isCreateMode ? createFirstName : editFirstName} onChange={(event) => isCreateMode ? setCreateFirstName(event.target.value) : setEditFirstName(event.target.value)} placeholder={messages.employees.firstName} title={messages.employees.firstName} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="employee-editor-last-name">{messages.employees.lastName}</label>
                <input id="employee-editor-last-name" className="form-input" value={isCreateMode ? createLastName : editLastName} onChange={(event) => isCreateMode ? setCreateLastName(event.target.value) : setEditLastName(event.target.value)} placeholder={messages.employees.lastName} title={messages.employees.lastName} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="employee-editor-role">{messages.employees.role}</label>
                <UiSelect id="employee-editor-role" value={isCreateMode ? createRole : editRole} options={editorRoleOptions} onChange={(value) => isCreateMode ? setCreateRole(value as EmployeeRole) : setEditRole(value as EmployeeRole)} title={messages.employees.role} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="employee-editor-team">{messages.employees.team}</label>
                <UiSelect id="employee-editor-team" value={isCreateMode ? createTeam : editTeam} options={editorTeamOptions} onChange={(value) => isCreateMode ? setCreateTeam(value as EmployeeTeam) : setEditTeam(value as EmployeeTeam)} title={messages.employees.team} disabled={Boolean(lockedTeam)} />
              </div>
            </div>
            <div className="emp-edit-secondary-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="employee-editor-email">{messages.employees.email}</label>
                <input id="employee-editor-email" className="form-input" type="email" value={isCreateMode ? createEmail : editEmail} onChange={(event) => isCreateMode ? setCreateEmail(event.target.value) : setEditEmail(event.target.value)} placeholder="max@equinix.com" title={messages.employees.email} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="employee-editor-full-name">{messages.employees.fullName}</label>
                <input id="employee-editor-full-name" className="form-input" value={isCreateMode ? `${createFirstName} ${createLastName}`.trim() : `${editFirstName} ${editLastName}`.trim()} disabled title={messages.employees.fullName} />
              </div>
            </div>
            {activeEditorRole === "trainer" && (
              <div className="form-group emp-pin-field">
                <span className="form-label">{messages.employees.pinLabel}</span>
                <div className="emp-pin-static" aria-live="polite">
                  <strong>2026</strong>
                  <span>{isCreateMode ? messages.employees.pinCreateHelp : messages.employees.pinEditHelpSet}</span>
                </div>
              </div>
            )}
            <div className="emp-edit-actions">
              <button className="btn btn-primary" onClick={() => void (isCreateMode ? handleCreate() : handleSaveEdit())} disabled={activeEditorBusy}>
                {isCreateMode ? (creating ? messages.employees.createBusy : messages.employees.createSubmit) : (saving ? messages.common.actions.saving : messages.common.actions.save)}
              </button>
              {!isCreateMode && editingId && <button className="btn btn-danger" onClick={() => void handleDelete(editingId)}>{messages.common.actions.delete}</button>}
            </div>
          </div>
        </div>
      )}

      <div className="card emp-list-card">
        <div className="card-header">
          <div className="card-header-left emp-section-heading">
            <img src={listLogo} alt={messages.employees.listTitle} className="emp-section-logo" />
            <div>
              <h2 className="emp-section-title">{messages.employees.listTitle}</h2>
              <p className="text-sm text-sec">{filteredRows.length} {messages.employees.hitsLabel} - {filteredTrainerCount} {messages.common.roles.trainer}{visibleTeamSummary ? ` - ${visibleTeamSummary}` : ""}</p>
            </div>
          </div>
          <div className="employee-list-header-meta">
            <span className="badge badge-default">{filteredRows.length} {messages.employees.hitsLabel}</span>
            <span className="badge badge-primary">{activeVisibleCount} {messages.employees.activeLabel}</span>
            <span className="badge badge-success">{completedVisibleCount} {messages.employees.completedLabel}</span>
          </div>
        </div>
        <div className="card-body flush emp-list-scroll">
          <div className="employee-list">
            {filteredRows.map((row) => renderRow(row.employee, row.progressSummary))}
            {filteredRows.length === 0 && <div className="empty-state emp-empty-state">{messages.employees.emptyFiltered}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}