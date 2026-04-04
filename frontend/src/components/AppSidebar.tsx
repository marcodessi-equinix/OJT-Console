import { memo } from "react";
import { IconUsers, IconFile, IconSend, IconDashboard, IconInfo } from "./Icons";
import { useLanguage } from "../features/language/LanguageProvider";

export type AppView = "dashboard" | "info" | "employees" | "documents" | "delivery";

interface Props {
  currentView: AppView;
  collapsed: boolean;
  visibleViews: AppView[];
  onToggleCollapse: () => void;
  onViewChange: (view: AppView) => void;
}

export const AppSidebar = memo(function AppSidebar({ currentView, collapsed, visibleViews, onToggleCollapse, onViewChange }: Props) {
  const { messages } = useLanguage();
  const allNavItems: Array<{ id: AppView; icon: React.ReactNode; label: string }> = [
    { id: "dashboard", icon: <IconDashboard />, label: messages.shell.viewTitles.dashboard },
    { id: "info", icon: <IconInfo />, label: messages.shell.viewTitles.info },
    { id: "employees", icon: <IconUsers />, label: messages.shell.viewTitles.employees },
    { id: "documents", icon: <IconFile />, label: messages.shell.viewTitles.documents },
    { id: "delivery", icon: <IconSend />, label: messages.shell.viewTitles.delivery }
  ];
  const navItems = allNavItems.filter((item) => visibleViews.includes(item.id));

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <button type="button" className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? messages.sidebar.expand : messages.sidebar.collapse}>
        <svg className={`sidebar-collapse-icon${collapsed ? " collapsed" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6 8.5 12l6 6" />
        </svg>
      </button>

      <div className="sidebar-brand">
        <img src="/eqx_digital-learning-badges_Instructor_SME.png" alt="OJT Logo" className="sidebar-brand-logo" />
        <div className="sidebar-brand-text">
          <span className="eyebrow">Equinix</span>
          <h1>OJT Console</h1>
          <p className="sidebar-brand-subtitle">{messages.sidebar.brandSubtitle}</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${currentView === item.id ? "active" : ""}`}
            onClick={() => onViewChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
});

AppSidebar.displayName = "AppSidebar";
