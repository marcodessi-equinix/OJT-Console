import { useMemo } from "react";
import { getIntlLocale, useLanguage } from "../features/language/LanguageProvider";
import type { EmployeeProfile, SubmissionListItem, TrainingTemplateSummary } from "../types/training";
import { formatDate as formatAppDate } from "../utils/date";
import { buildEmployeeProgress } from "../utils/employeeProgress";

interface Props {
  employees: EmployeeProfile[];
  templates: TrainingTemplateSummary[];
  submissions: SubmissionListItem[];
}

type EmployeeStatus = "not_started" | "blocked" | "ready" | "in_progress" | "complete";

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

export function Dashboard({ employees, templates, submissions }: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const teamMeta = useMemo<DashboardTeamMeta[]>(() => [
    { id: "C-OPS", label: messages.dashboard.teamCops, appearance: "cops", meterTone: "primary" },
    { id: "F-OPS", label: messages.dashboard.teamFops, appearance: "fops", meterTone: "accent" }
  ], [messages.dashboard.teamCops, messages.dashboard.teamFops]);
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
  const openDrafts = useMemo(() => submissions.filter((submission) => submission.sendStatus === "draft").length, [submissions]);
  const recentSubmissions = useMemo(() => submissions.slice(0, 5), [submissions]);
  const employeeCountByTeam = useMemo(() => countItemsByTeam(employeeOnly), [employeeOnly]);
  const trainerCountByTeam = useMemo(() => countItemsByTeam(trainers), [trainers]);
  const completedByTeam = useMemo(() => countItemsByTeam(employeeRows.filter((row) => row.status === "complete").map((row) => row.employee)), [employeeRows]);
  const openByTeam = useMemo(() => countItemsByTeam(employeeRows.filter((row) => row.status === "ready" || row.status === "in_progress" || row.status === "blocked").map((row) => row.employee)), [employeeRows]);
  const notStartedByTeam = useMemo(() => countItemsByTeam(employeeRows.filter((row) => row.status === "not_started").map((row) => row.employee)), [employeeRows]);
  const cOpsDocumentCount = useMemo(() => templates.filter((template) => template.team === "C-OPS").length, [templates]);
  const fOpsDocumentCount = useMemo(() => templates.filter((template) => template.team === "F-OPS").length, [templates]);
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
  const statusBreakdown = useMemo(() => [
    {
      id: "complete",
      label: messages.common.trainingStatus.complete,
      count: completedEmployees,
      tone: "success",
      detail: messages.dashboard.completeDetail,
      breakdown: buildTeamBreakdown(teamMeta, completedByTeam, completedEmployees)
    },
    {
      id: "active",
      label: messages.dashboard.activeTrainings,
      count: openEmployees,
      tone: "primary",
      detail: messages.dashboard.activeDetail,
      breakdown: buildTeamBreakdown(teamMeta, openByTeam, openEmployees)
    },
    {
      id: "not_started",
      label: messages.common.trainingStatus.notStarted,
      count: notStartedEmployees,
      tone: "warn",
      detail: messages.dashboard.notStartedDetail,
      breakdown: buildTeamBreakdown(teamMeta, notStartedByTeam, notStartedEmployees)
    }
  ], [completedByTeam, completedEmployees, messages.common.trainingStatus.complete, messages.common.trainingStatus.notStarted, messages.dashboard.activeDetail, messages.dashboard.activeTrainings, messages.dashboard.completeDetail, messages.dashboard.notStartedDetail, notStartedByTeam, notStartedEmployees, openByTeam, openEmployees, teamMeta]);
  const metricCards = useMemo(() => [
    {
      label: messages.dashboard.metrics.employees,
      value: employeeOnly.length,
      detail: `${completedEmployees} ${messages.common.trainingStatus.complete}`,
      tone: "primary",
      breakdown: buildTeamBreakdown(teamMeta, employeeCountByTeam, employeeOnly.length)
    },
    {
      label: messages.dashboard.metrics.trainers,
      value: trainerCount,
      detail: messages.dashboard.totalOverall,
      tone: "success",
      breakdown: buildTeamBreakdown(teamMeta, trainerCountByTeam, trainerCount)
    },
    {
      label: messages.dashboard.metrics.completed,
      value: completedEmployees,
      detail: `${openDrafts} ${messages.dashboard.metrics.forDelivery}`,
      tone: "accent",
      breakdown: buildTeamBreakdown(teamMeta, completedByTeam, completedEmployees)
    },
    {
      label: messages.dashboard.metrics.openPdfs,
      value: openDrafts,
      detail: `${openEmployees} ${messages.dashboard.activeTrainings}`,
      tone: "warn",
      breakdown: buildTeamBreakdown(teamMeta, openByTeam, openEmployees)
    }
  ], [completedByTeam, completedEmployees, employeeCountByTeam, employeeOnly.length, messages.common.trainingStatus.complete, messages.dashboard.activeTrainings, messages.dashboard.metrics.completed, messages.dashboard.metrics.employees, messages.dashboard.metrics.forDelivery, messages.dashboard.metrics.openPdfs, messages.dashboard.metrics.trainers, messages.dashboard.totalOverall, openByTeam, openDrafts, openEmployees, teamMeta, trainerCount, trainerCountByTeam]);

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
                <div key={submission.id} className="dashboard-activity-item">
                  <div>
                    <strong>{submission.employeeName}</strong>
                    <p>{submission.templateTitle}</p>
                  </div>
                  <div className="dashboard-activity-item-meta">
                    <span className={`badge badge-${submission.sendStatus === "send_failed" ? "error" : submission.sendStatus === "sent" ? "success" : "warn"}`}>
                      {submission.sendStatus === "send_failed"
                        ? messages.common.submissionStatus.failed
                        : submission.sendStatus === "sent"
                          ? messages.common.submissionStatus.sent
                          : messages.common.submissionStatus.draft}
                    </span>
                    <small>{formatDate(submission.sentAt ?? submission.createdAt, intlLocale)}</small>
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