import { useMemo } from "react";
import { getIntlLocale, useLanguage } from "../features/language/LanguageProvider";
import type { EmployeeProfile, EmployeeTeam, SubmissionListItem, TrainingTemplateSummary } from "../types/training";
import { formatDate as formatAppDate } from "../utils/date";
import { buildEmployeeProgress } from "../utils/employeeProgress";
import {
  countDistinctTemplateModules,
  getLogicalSubmissionRepresentatives,
  getModuleKey,
  getSubmissionTimestamp,
  normalizeModuleTitle
} from "../utils/moduleIdentity";

interface Props {
  employees: EmployeeProfile[];
  templates: TrainingTemplateSummary[];
  submissions: SubmissionListItem[];
  visibleTeams: EmployeeTeam[];
}

type EmployeeStatus = "not_started" | "blocked" | "ready" | "in_progress" | "complete";
type DashboardTone = "primary" | "success" | "accent" | "warn";

interface EmployeeDashboardRow {
  employee: EmployeeProfile;
  status: EmployeeStatus;
}

interface DashboardTeamMeta {
  id: "C-OPS" | "F-OPS";
  label: string;
  appearance: "cops" | "fops";
  meterTone: "primary" | "accent";
}

interface DashboardTeamBreakdownItem extends DashboardTeamMeta {
  count: number;
  share: number;
}

interface LogicalSubmissionItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeTeam: "C-OPS" | "F-OPS";
  templateTitle: string;
  sendStatus: SubmissionListItem["sendStatus"];
  createdAt: string;
  completedAt?: string;
  sentAt?: string;
}

function formatDate(value: string | undefined, locale: string): string {
  return formatAppDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countItemsByTeam<T extends { team: "C-OPS" | "F-OPS" }>(items: T[]): Record<"C-OPS" | "F-OPS", number> {
  return items.reduce<Record<"C-OPS" | "F-OPS", number>>((counts, item) => {
    counts[item.team] += 1;
    return counts;
  }, {
    "C-OPS": 0,
    "F-OPS": 0
  });
}

function buildTeamBreakdown(
  teams: DashboardTeamMeta[],
  counts: Record<"C-OPS" | "F-OPS", number>,
  totalCount: number
): DashboardTeamBreakdownItem[] {
  return teams.map((team) => {
    const count = counts[team.id];

    return {
      ...team,
      count,
      share: clampPercent(totalCount > 0 ? (count / totalCount) * 100 : 0)
    };
  });
}

function buildLogicalSubmissions(
  submissions: SubmissionListItem[],
  employees: EmployeeProfile[]
): LogicalSubmissionItem[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const grouped = new Map<string, SubmissionListItem[]>();

  for (const submission of submissions) {
    const key = `${submission.employeeId}::${getModuleKey(submission.templateTitle)}`;
    const items = grouped.get(key) ?? [];
    items.push(submission);
    grouped.set(key, items);
  }

  return Array.from(grouped.values())
    .map((items) => {
      const representative = getLogicalSubmissionRepresentatives(items)[0];
      const employee = employeeById.get(representative.employeeId);

      return {
        id: representative.id,
        employeeId: representative.employeeId,
        employeeName: representative.employeeName,
        employeeTeam: employee?.team ?? "C-OPS",
        templateTitle: normalizeModuleTitle(representative.templateTitle),
        sendStatus: representative.sendStatus,
        createdAt: representative.createdAt,
        completedAt: representative.completedAt,
        sentAt: representative.sentAt
      };
    })
    .sort((left, right) => getSubmissionTimestamp(right) - getSubmissionTimestamp(left));
}

function DashboardRing({ value, total, label, ofLabel }: { value: number; total: number; label: string; ofLabel: string }) {
  const safeTotal = Math.max(total, 1);
  const percent = clampPercent((value / safeTotal) * 100);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * percent) / 100;

  return (
    <div className="dashboard-ring-card">
      <svg className="dashboard-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle className="dashboard-ring-track" cx="60" cy="60" r={radius} />
        <circle className="dashboard-ring-value" cx="60" cy="60" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="dashboard-ring-copy">
        <strong>{percent}%</strong>
        <span>{label}</span>
        <small>{value} {ofLabel} {total}</small>
      </div>
    </div>
  );
}

export function Dashboard({ employees, templates, submissions, visibleTeams }: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const dashboardCopy = locale === "de"
    ? {
        moduleCountDetail: "logische OJT-Module",
        draftDetail: "noch nicht abgeschlossen oder versendet",
        completedDetail: "per PDF oder Entwurf abgeschlossen",
        sentDetail: "bereits versendet",
        failedDetail: "mit Versandfehler",
        draftStatusDetail: "Gespeichert, aber noch nicht abgeschlossen oder versendet",
        completedStatusDetail: "Abgeschlossen, aber noch nicht versendet",
        sentStatusDetail: "Bereits als Mail verschickt",
        failedStatusDetail: "Versand ist fehlgeschlagen",
        teamScopeActive: "Team-Scope aktiv",
        singleTeamHeroTitleSuffix: "Command Deck",
        singleTeamHeroCopy: (teamLabel: string) => `Alle Kennzahlen, Trainings- und Versandsignale fuer ${teamLabel} in einer fokussierten Ansicht ohne leere Vergleichsflaechen.`,
        progressPanelLabel: "Team Completion",
        trainerScopeDetail: "Trainer mit aktivem Zugriff auf dieses Team",
        moduleScopeDetail: "logische OJT-Module im aktuellen Scope",
        deliveryBacklogLabel: "Delivery-Fokus",
        deliveryBacklogDetail: "offene Entwuerfe oder fehlgeschlagene Zustellungen",
        sendReadinessLabel: "Send-Readiness",
        sendReadinessDetail: "abgeschlossen oder bereits versendet",
        focusTitle: "Operativer Fokus",
        focusCopy: "Abschlussquote, aktives Volumen und Backlog fuer das sichtbare Team in einer einzigen Leitwarte.",
        visibleShareLabel: "des sichtbaren Volumens",
        teamSignalTitle: "Modulbibliothek & Versandlage",
        teamSignalCopy: (teamLabel: string) => `Dokumentumfang, Versandvolumen und offene Punkte fuer ${teamLabel} auf einen Blick.`,
        readyStateLabel: "bereit",
        scopeModulesLabel: "Module im Scope"
      }
    : {
        moduleCountDetail: "logical OJT modules",
        draftDetail: "not yet completed or sent",
        completedDetail: "completed through PDF or draft",
        sentDetail: "already sent",
        failedDetail: "with delivery error",
        draftStatusDetail: "Saved, but not yet completed or sent",
        completedStatusDetail: "Completed, but not yet sent",
        sentStatusDetail: "Already delivered by email",
        failedStatusDetail: "Delivery failed",
        teamScopeActive: "Team scope active",
        singleTeamHeroTitleSuffix: "Command Deck",
        singleTeamHeroCopy: (teamLabel: string) => `All training, delivery, and library signals for ${teamLabel} in one focused view without empty comparison space.`,
        progressPanelLabel: "Team completion",
        trainerScopeDetail: "Trainers with active access to this team",
        moduleScopeDetail: "logical OJT modules in the current scope",
        deliveryBacklogLabel: "Delivery focus",
        deliveryBacklogDetail: "open drafts or failed deliveries",
        sendReadinessLabel: "Send readiness",
        sendReadinessDetail: "completed or already sent",
        focusTitle: "Operational focus",
        focusCopy: "Completion rate, active volume, and backlog for the visible team in a single command deck.",
        visibleShareLabel: "of visible volume",
        teamSignalTitle: "Library and delivery pulse",
        teamSignalCopy: (teamLabel: string) => `Document coverage, delivery throughput, and open items for ${teamLabel} at a glance.`,
        readyStateLabel: "ready",
        scopeModulesLabel: "modules in scope"
      };
  const teamMeta = useMemo<DashboardTeamMeta[]>(() => {
    const allTeamMeta: DashboardTeamMeta[] = [
      { id: "C-OPS", label: messages.dashboard.teamCops, appearance: "cops", meterTone: "primary" },
      { id: "F-OPS", label: messages.dashboard.teamFops, appearance: "fops", meterTone: "accent" }
    ];

    return allTeamMeta.filter((team) => visibleTeams.includes(team.id));
  }, [messages.dashboard.teamCops, messages.dashboard.teamFops, visibleTeams]);
  const employeeOnly = useMemo(() => employees.filter((employee) => employee.role === "employee"), [employees]);
  const trainers = useMemo(() => employees.filter((employee) => employee.role === "trainer"), [employees]);
  const trainerCount = trainers.length;
  const employeeRows = useMemo<EmployeeDashboardRow[]>(() => employeeOnly.map((employee) => ({
    employee,
    status: buildEmployeeProgress(employee, templates, submissions)?.status ?? "not_started"
  })), [employeeOnly, submissions, templates]);
  const completedEmployees = useMemo(() => employeeRows.filter((row) => row.status === "complete").length, [employeeRows]);
  const openEmployees = useMemo(() => employeeRows.filter((row) => row.status === "ready" || row.status === "in_progress" || row.status === "blocked").length, [employeeRows]);
  const notStartedEmployees = useMemo(() => employeeRows.filter((row) => row.status === "not_started").length, [employeeRows]);
  const logicalSubmissions = useMemo(() => buildLogicalSubmissions(submissions, employees), [employees, submissions]);
  const draftModules = useMemo(() => logicalSubmissions.filter((item) => item.sendStatus === "draft"), [logicalSubmissions]);
  const completedModules = useMemo(() => logicalSubmissions.filter((item) => item.sendStatus === "completed"), [logicalSubmissions]);
  const sentModules = useMemo(() => logicalSubmissions.filter((item) => item.sendStatus === "sent"), [logicalSubmissions]);
  const failedModules = useMemo(() => logicalSubmissions.filter((item) => item.sendStatus === "send_failed"), [logicalSubmissions]);
  const recentSubmissions = useMemo(() => logicalSubmissions.slice(0, 5), [logicalSubmissions]);
  const employeeCountByTeam = useMemo(() => countItemsByTeam(employeeOnly), [employeeOnly]);
  const trainerCountByTeam = useMemo(() => countItemsByTeam(trainers), [trainers]);
  const completedByTeam = useMemo(() => countItemsByTeam(employeeRows.filter((row) => row.status === "complete").map((row) => row.employee)), [employeeRows]);
  const openByTeam = useMemo(() => countItemsByTeam(employeeRows.filter((row) => row.status === "ready" || row.status === "in_progress" || row.status === "blocked").map((row) => row.employee)), [employeeRows]);
  const notStartedByTeam = useMemo(() => countItemsByTeam(employeeRows.filter((row) => row.status === "not_started").map((row) => row.employee)), [employeeRows]);
  const draftModulesByTeam = useMemo(() => countItemsByTeam(draftModules.map((item) => ({ team: item.employeeTeam }))), [draftModules]);
  const completedModulesByTeam = useMemo(() => countItemsByTeam(completedModules.map((item) => ({ team: item.employeeTeam }))), [completedModules]);
  const sentModulesByTeam = useMemo(() => countItemsByTeam(sentModules.map((item) => ({ team: item.employeeTeam }))), [sentModules]);
  const failedModulesByTeam = useMemo(() => countItemsByTeam(failedModules.map((item) => ({ team: item.employeeTeam }))), [failedModules]);
  const cOpsDocumentCount = useMemo(() => countDistinctTemplateModules(templates.filter((template) => template.team === "C-OPS")), [templates]);
  const fOpsDocumentCount = useMemo(() => countDistinctTemplateModules(templates.filter((template) => template.team === "F-OPS")), [templates]);
  const teamBreakdown = useMemo(() => buildTeamBreakdown(teamMeta, {
    "C-OPS": cOpsDocumentCount,
    "F-OPS": fOpsDocumentCount
  }, cOpsDocumentCount + fOpsDocumentCount), [cOpsDocumentCount, fOpsDocumentCount, teamMeta]);
  const progressByTeam = useMemo(() => teamMeta.map((team) => {
    const total = employeeCountByTeam[team.id];
    const completed = completedByTeam[team.id];
    const active = openByTeam[team.id];
    const pending = notStartedByTeam[team.id];
    const percent = clampPercent(total > 0 ? (completed / total) * 100 : 0);

    return {
      ...team,
      total,
      completed,
      active,
      pending,
      percent
    };
  }), [completedByTeam, employeeCountByTeam, notStartedByTeam, openByTeam, teamMeta]);
  const statusBreakdown = useMemo(() => ([
    {
      id: "draft",
      label: messages.common.submissionStatus.draft,
      count: draftModules.length,
      tone: "warn" as DashboardTone,
      detail: dashboardCopy.draftStatusDetail,
      breakdown: buildTeamBreakdown(teamMeta, draftModulesByTeam, draftModules.length)
    },
    {
      id: "completed",
      label: messages.common.submissionStatus.completed,
      count: completedModules.length,
      tone: "primary" as DashboardTone,
      detail: dashboardCopy.completedStatusDetail,
      breakdown: buildTeamBreakdown(teamMeta, completedModulesByTeam, completedModules.length)
    },
    {
      id: "sent",
      label: messages.common.submissionStatus.sent,
      count: sentModules.length,
      tone: "success" as DashboardTone,
      detail: dashboardCopy.sentStatusDetail,
      breakdown: buildTeamBreakdown(teamMeta, sentModulesByTeam, sentModules.length)
    },
    {
      id: "failed",
      label: messages.common.submissionStatus.failed,
      count: failedModules.length,
      tone: "warn" as DashboardTone,
      detail: dashboardCopy.failedStatusDetail,
      breakdown: buildTeamBreakdown(teamMeta, failedModulesByTeam, failedModules.length)
    }
  ]), [completedModules.length, completedModulesByTeam, dashboardCopy.completedStatusDetail, dashboardCopy.draftStatusDetail, dashboardCopy.failedStatusDetail, dashboardCopy.sentStatusDetail, draftModules.length, draftModulesByTeam, failedModules.length, failedModulesByTeam, messages.common.submissionStatus.completed, messages.common.submissionStatus.draft, messages.common.submissionStatus.failed, messages.common.submissionStatus.sent, sentModules.length, sentModulesByTeam, teamMeta]);
  const metricCards = useMemo(() => [
    {
      label: messages.dashboard.metrics.employees,
      value: employeeOnly.length,
      detail: `${logicalSubmissions.length} ${dashboardCopy.moduleCountDetail}`,
      tone: "primary" as DashboardTone,
      breakdown: buildTeamBreakdown(teamMeta, employeeCountByTeam, employeeOnly.length)
    },
    {
      label: messages.dashboard.metrics.trainers,
      value: trainerCount,
      detail: messages.dashboard.totalOverall,
      tone: "success" as DashboardTone,
      breakdown: buildTeamBreakdown(teamMeta, trainerCountByTeam, trainerCount)
    },
    {
      label: messages.common.submissionStatus.draft,
      value: draftModules.length,
      detail: dashboardCopy.draftDetail,
      tone: "warn" as DashboardTone,
      breakdown: buildTeamBreakdown(teamMeta, draftModulesByTeam, draftModules.length)
    },
    {
      label: messages.common.submissionStatus.completed,
      value: completedModules.length,
      detail: `${sentModules.length} ${messages.common.submissionStatus.sent}`,
      tone: "accent" as DashboardTone,
      breakdown: buildTeamBreakdown(teamMeta, completedModulesByTeam, completedModules.length)
    }
  ], [completedModules.length, completedModulesByTeam, dashboardCopy.draftDetail, dashboardCopy.moduleCountDetail, draftModules.length, draftModulesByTeam, employeeCountByTeam, employeeOnly.length, logicalSubmissions.length, messages.common.submissionStatus.completed, messages.common.submissionStatus.draft, messages.common.submissionStatus.sent, messages.dashboard.metrics.employees, messages.dashboard.metrics.trainers, messages.dashboard.totalOverall, sentModules.length, teamMeta, trainerCount, trainerCountByTeam]);

  const isSingleTeamDashboard = teamMeta.length === 1;
  const focusTeamMeta = isSingleTeamDashboard ? teamMeta[0] : null;
  const focusProgress = isSingleTeamDashboard ? progressByTeam[0] : null;
  const focusTeamDocuments = isSingleTeamDashboard ? teamBreakdown[0] : null;
  const deliveryBacklogCount = draftModules.length + failedModules.length;
  const readyModulesCount = completedModules.length + sentModules.length;
  const sendReadinessPercent = clampPercent(logicalSubmissions.length > 0 ? (readyModulesCount / logicalSubmissions.length) * 100 : 0);
  const signalSegmentsActive = Math.max(1, Math.round(sendReadinessPercent / 17));
  const signalTone: DashboardTone = deliveryBacklogCount > readyModulesCount
    ? "warn"
    : focusTeamMeta?.meterTone === "accent"
      ? "accent"
      : readyModulesCount > 0
        ? "success"
        : "primary";
  const recentActivityPanel = (
    <article className="card">
      <div className="card-header">
        <div className="card-header-left">
          <span className="eyebrow">{messages.dashboard.recentEyebrow}</span>
          <h3>{messages.dashboard.recentTitle}</h3>
        </div>
      </div>
      <div className="card-body compact dashboard-activity-list">
        {recentSubmissions.length === 0 ? (
          <div className="empty-state">{messages.dashboard.noActivity}</div>
        ) : (
          recentSubmissions.map((submission) => (
            <div key={submission.employeeId + submission.templateTitle} className="dashboard-activity-item">
              <div>
                <strong>{submission.employeeName}</strong>
                <p>{submission.templateTitle}</p>
              </div>
              <div className="dashboard-activity-item-meta">
                <span className={`badge badge-${submission.sendStatus === "send_failed" ? "error" : submission.sendStatus === "sent" || submission.sendStatus === "completed" ? "success" : "warn"}`}>
                  {submission.sendStatus === "send_failed"
                    ? messages.common.submissionStatus.failed
                    : submission.sendStatus === "sent"
                      ? messages.common.submissionStatus.sent
                      : submission.sendStatus === "completed"
                        ? messages.common.submissionStatus.completed
                        : messages.common.submissionStatus.draft}
                </span>
                <small>{formatDate(submission.sentAt ?? submission.completedAt ?? submission.createdAt, intlLocale)}</small>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );

  if (focusTeamMeta && focusProgress && focusTeamDocuments) {
    const singleTeamMetricCards = [
      {
        label: messages.dashboard.metrics.employees,
        value: employeeOnly.length,
        detail: `${completedEmployees} ${messages.common.trainingStatus.complete} • ${openEmployees} ${messages.dashboard.activeTrainings}`,
        tone: "primary" as DashboardTone
      },
      {
        label: messages.dashboard.metrics.trainers,
        value: trainerCount,
        detail: dashboardCopy.trainerScopeDetail,
        tone: "success" as DashboardTone
      },
      {
        label: messages.dashboard.metrics.templates,
        value: focusTeamDocuments.count,
        detail: dashboardCopy.moduleScopeDetail,
        tone: focusTeamMeta.meterTone,
      },
      {
        label: dashboardCopy.deliveryBacklogLabel,
        value: deliveryBacklogCount,
        detail: dashboardCopy.deliveryBacklogDetail,
        tone: "warn" as DashboardTone
      }
    ];
    const singleTeamStatusCards = statusBreakdown.map((item) => ({
      ...item,
      shareOfVisible: clampPercent(logicalSubmissions.length > 0 ? (item.count / logicalSubmissions.length) * 100 : 0)
    }));

    return (
      <div className={`dashboard-shell dashboard-shell-single dashboard-shell-${focusTeamMeta.appearance}`}>
        <section className={`dashboard-hero dashboard-hero-single dashboard-hero-${focusTeamMeta.appearance} card`}>
          <div className="card-body compact dashboard-hero-body dashboard-hero-body-single">
            <div className="dashboard-hero-main">
              <span className="eyebrow">{messages.dashboard.heroEyebrow}</span>
              <div className="dashboard-team-badge-row">
                <span className={`dashboard-team-badge dashboard-team-badge-${focusTeamMeta.appearance}`}>{focusTeamMeta.label}</span>
                <span className="dashboard-hero-kicker">{dashboardCopy.teamScopeActive}</span>
              </div>
              <h2 className="dashboard-hero-title dashboard-hero-title-single">{`${focusTeamMeta.label} ${dashboardCopy.singleTeamHeroTitleSuffix}`}</h2>
              <p className="dashboard-hero-copy">{dashboardCopy.singleTeamHeroCopy(focusTeamMeta.label)}</p>
              <div className="dashboard-inline-stats dashboard-inline-stats-hero">
                <div>
                  <strong>{employeeOnly.length}</strong>
                  <span>{messages.dashboard.metrics.employees}</span>
                </div>
                <div>
                  <strong>{focusTeamDocuments.count}</strong>
                  <span>{dashboardCopy.scopeModulesLabel}</span>
                </div>
                <div>
                  <strong>{sendReadinessPercent}%</strong>
                  <span>{dashboardCopy.sendReadinessLabel}</span>
                </div>
              </div>
            </div>

            <aside className={`dashboard-hero-spotlight dashboard-hero-spotlight-${focusTeamMeta.appearance}`}>
              <span className="dashboard-hero-spotlight-label">{dashboardCopy.progressPanelLabel}</span>
              <DashboardRing
                value={focusProgress.completed}
                total={focusProgress.total}
                label={messages.dashboard.completionLabel}
                ofLabel={messages.dashboard.ofTotal}
              />
              <div className="dashboard-hero-spotlight-grid">
                <div>
                  <strong>{focusProgress.completed}</strong>
                  <span>{messages.common.trainingStatus.complete}</span>
                </div>
                <div>
                  <strong>{focusProgress.active}</strong>
                  <span>{messages.dashboard.activeTrainings}</span>
                </div>
                <div>
                  <strong>{focusProgress.pending}</strong>
                  <span>{messages.common.trainingStatus.notStarted}</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="dashboard-metric-grid dashboard-metric-grid-single">
          {singleTeamMetricCards.map((metric) => (
            <article key={metric.label} className={`dashboard-metric-card dashboard-metric-card-${metric.tone} dashboard-metric-card-solo card`}>
              <div className="card-body compact dashboard-metric-card-body">
                <div className="dashboard-metric-topline">
                  <span className="dashboard-metric-label">{metric.label}</span>
                  <span className={`dashboard-metric-dot dashboard-metric-dot-${metric.tone}`} />
                </div>
                <strong className="dashboard-metric-value">{metric.value}</strong>
                <p className="dashboard-metric-detail">{metric.detail}</p>
                <div className={`dashboard-metric-solo-badge dashboard-metric-solo-badge-${focusTeamMeta.appearance}`}>{focusTeamMeta.label}</div>
              </div>
            </article>
          ))}
        </section>

        <section className="dashboard-grid dashboard-grid-single-focus">
          <article className="card dashboard-focus-card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{messages.dashboard.progressEyebrow}</span>
                <h3>{dashboardCopy.focusTitle}</h3>
              </div>
            </div>
            <div className="card-body compact dashboard-focus-panel">
              <div className="dashboard-focus-copy">
                <p className="dashboard-focus-copy-text">{dashboardCopy.focusCopy}</p>
                <div className="dashboard-focus-meter-stack">
                  <div className="dashboard-focus-meter-row">
                    <span>{messages.dashboard.completionLabel}</span>
                    <strong>{focusProgress.percent}%</strong>
                  </div>
                  <progress className={`dashboard-meter dashboard-meter-${focusTeamMeta.meterTone}`} max={100} value={focusProgress.percent} aria-hidden="true" />
                </div>
                <div className="dashboard-focus-meter-stack">
                  <div className="dashboard-focus-meter-row">
                    <span>{dashboardCopy.sendReadinessLabel}</span>
                    <strong>{sendReadinessPercent}%</strong>
                  </div>
                  <progress className={`dashboard-meter dashboard-meter-${signalTone === "accent" ? "accent" : signalTone}`} max={100} value={sendReadinessPercent} aria-hidden="true" />
                </div>
              </div>
              <div className="dashboard-focus-stat-grid">
                <div className="dashboard-focus-stat">
                  <strong>{readyModulesCount}</strong>
                  <span>{dashboardCopy.readyStateLabel}</span>
                </div>
                <div className="dashboard-focus-stat">
                  <strong>{deliveryBacklogCount}</strong>
                  <span>{dashboardCopy.deliveryBacklogLabel}</span>
                </div>
                <div className="dashboard-focus-stat">
                  <strong>{logicalSubmissions.length}</strong>
                  <span>{dashboardCopy.moduleCountDetail}</span>
                </div>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{messages.dashboard.statusEyebrow}</span>
                <h3>{messages.dashboard.statusTitle}</h3>
              </div>
            </div>
            <div className="card-body compact dashboard-status-spotlight-grid">
              {singleTeamStatusCards.map((item) => (
                <div key={item.id} className={`dashboard-status-spotlight-card dashboard-status-spotlight-card-${item.tone}`}>
                  <div className="dashboard-status-spotlight-head">
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <p>{item.detail}</p>
                  <progress className={`dashboard-meter dashboard-meter-${item.tone === "accent" ? "accent" : item.tone}`} max={100} value={item.shareOfVisible} aria-hidden="true" />
                  <small>{item.shareOfVisible}% {dashboardCopy.visibleShareLabel}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="dashboard-grid dashboard-grid-single-tail">
          {recentActivityPanel}

          <article className="card dashboard-team-command-card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="eyebrow">{messages.dashboard.teamEyebrow}</span>
                <h3>{dashboardCopy.teamSignalTitle}</h3>
              </div>
            </div>
            <div className="card-body compact dashboard-team-command">
              <div className="dashboard-team-command-head">
                <div>
                  <span className={`dashboard-team-badge dashboard-team-badge-${focusTeamMeta.appearance}`}>{focusTeamMeta.label}</span>
                  <p className="dashboard-team-command-copy">{dashboardCopy.teamSignalCopy(focusTeamMeta.label)}</p>
                </div>
                <strong className="dashboard-team-command-total">{focusTeamDocuments.count}</strong>
              </div>
              <div className="dashboard-signal-rail">
                {Array.from({ length: 6 }, (_, index) => (
                  <span
                    key={`${focusTeamMeta.id}-signal-${index}`}
                    className={`dashboard-signal-segment dashboard-signal-segment-${signalTone} ${index < signalSegmentsActive ? "active" : ""}`}
                  />
                ))}
              </div>
              <div className="dashboard-team-command-grid">
                <div className="dashboard-team-command-stat">
                  <span>{messages.dashboard.metrics.templates}</span>
                  <strong>{focusTeamDocuments.count}</strong>
                </div>
                <div className="dashboard-team-command-stat">
                  <span>{dashboardCopy.readyStateLabel}</span>
                  <strong>{readyModulesCount}</strong>
                </div>
                <div className="dashboard-team-command-stat">
                  <span>{dashboardCopy.deliveryBacklogLabel}</span>
                  <strong>{deliveryBacklogCount}</strong>
                </div>
              </div>
              <p className="dashboard-team-command-detail">{dashboardCopy.sendReadinessDetail}</p>
            </div>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <section className="dashboard-hero card">
        <div className="card-body compact dashboard-hero-body">
          <div className="dashboard-hero-main">
            <span className="eyebrow">{messages.dashboard.heroEyebrow}</span>
            <h2 className="dashboard-hero-title">{messages.dashboard.heroTitle}</h2>
            <p className="dashboard-hero-copy">{messages.dashboard.heroCopy}</p>
          </div>
        </div>
      </section>

      <section className="dashboard-metric-grid">
        {metricCards.map((metric) => (
          <article key={metric.label} className={`dashboard-metric-card dashboard-metric-card-${metric.tone} card`}>
            <div className="card-body compact dashboard-metric-card-body">
              <div className="dashboard-metric-topline">
                <span className="dashboard-metric-label">{metric.label}</span>
                <span className={`dashboard-metric-dot dashboard-metric-dot-${metric.tone}`} />
              </div>
              <div className="dashboard-metric-body">
                <div className="dashboard-metric-copy">
                  <strong className="dashboard-metric-value">{metric.value}</strong>
                  <p className="dashboard-metric-detail">{metric.detail}</p>
                </div>
                <div className="dashboard-metric-team-split">
                  {metric.breakdown.map((item) => (
                    <div key={`${metric.label}-${item.id}`} className={`dashboard-metric-team-pill dashboard-metric-team-pill-${item.appearance}`}>
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.dashboard.statusEyebrow}</span>
              <h3>{messages.dashboard.statusTitle}</h3>
            </div>
          </div>
          <div className="card-body compact dashboard-status-list">
            {statusBreakdown.map((item) => (
              <div key={item.id} className={`dashboard-status-row dashboard-status-row-${item.tone}`}>
                <div className="dashboard-status-overview">
                  <div>
                    <span className="dashboard-status-label">{item.label}</span>
                    <p>{item.detail}</p>
                  </div>
                  <strong className="dashboard-status-total">{item.count}</strong>
                </div>
                <div className="dashboard-status-team-grid">
                  {item.breakdown.map((team) => (
                    <div key={`${item.id}-${team.id}`} className={`dashboard-status-team-panel dashboard-status-team-panel-${team.appearance}`}>
                      <div className="dashboard-status-team-panel-head">
                        <span>{team.label}</span>
                        <strong>{team.count}</strong>
                      </div>
                      <progress className={`dashboard-meter dashboard-meter-${team.meterTone}`} max={100} value={team.share} aria-hidden="true" />
                      <small>{team.share}%</small>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.dashboard.recentEyebrow}</span>
              <h3>{messages.dashboard.recentTitle}</h3>
            </div>
          </div>
          <div className="card-body compact dashboard-activity-list">
            {recentSubmissions.length === 0 ? (
              <div className="empty-state">{messages.dashboard.noActivity}</div>
            ) : (
              recentSubmissions.map((submission) => (
                <div key={submission.employeeId + submission.templateTitle} className="dashboard-activity-item">
                  <div>
                    <strong>{submission.employeeName}</strong>
                    <p>{submission.templateTitle}</p>
                  </div>
                  <div className="dashboard-activity-item-meta">
                    <span className={`badge badge-${submission.sendStatus === "send_failed" ? "error" : submission.sendStatus === "sent" || submission.sendStatus === "completed" ? "success" : "warn"}`}>
                      {submission.sendStatus === "send_failed"
                        ? messages.common.submissionStatus.failed
                        : submission.sendStatus === "sent"
                          ? messages.common.submissionStatus.sent
                          : submission.sendStatus === "completed"
                            ? messages.common.submissionStatus.completed
                            : messages.common.submissionStatus.draft}
                    </span>
                    <small>{formatDate(submission.sentAt ?? submission.completedAt ?? submission.createdAt, intlLocale)}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.dashboard.progressEyebrow}</span>
              <h3>{messages.dashboard.progressTitle}</h3>
            </div>
          </div>
          <div className="card-body compact dashboard-panel-body">
            <DashboardRing value={completedEmployees} total={employeeOnly.length} label={messages.dashboard.completionLabel} ofLabel={messages.dashboard.ofTotal} />
            <div className="dashboard-progress-team-grid">
              {progressByTeam.map((team) => (
                <div key={team.id} className={`dashboard-progress-team dashboard-progress-team-${team.appearance}`}>
                  <div className="dashboard-progress-team-head">
                    <span>{team.label}</span>
                    <strong>{team.percent}%</strong>
                  </div>
                  <progress className={`dashboard-meter dashboard-meter-${team.meterTone}`} max={100} value={team.percent} />
                  <div className="dashboard-progress-team-stats">
                    <span>{team.completed} {messages.common.trainingStatus.complete}</span>
                    <span>{team.active} {messages.dashboard.activeTrainings}</span>
                    <span>{team.pending} {messages.common.trainingStatus.notStarted}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.dashboard.teamEyebrow}</span>
              <h3>{messages.dashboard.teamTitle}</h3>
            </div>
          </div>
          <div className="card-body compact dashboard-team-grid">
            {teamBreakdown.map((item) => (
              <div key={item.id} className={`dashboard-team-card dashboard-team-card-${item.appearance}`}>
                <span className="dashboard-team-card-label">{item.label}</span>
                <strong className="dashboard-team-card-value">{item.count}</strong>
                <p className="dashboard-team-card-copy">{messages.dashboard.teamDocumentsDetail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
