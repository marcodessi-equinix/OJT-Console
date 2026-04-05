const s = { width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconUsers() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconDashboard() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect x="14" y="10" width="7" height="11" rx="1.5" />
      <rect x="3" y="13" width="7" height="8" rx="1.5" />
    </svg>
  );
}

export function IconFile() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export function IconClipboard() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}

export function IconSend() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function IconClipboardList() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="15" y2="15" />
      <line x1="9" y1="19" x2="13" y2="19" />
    </svg>
  );
}

export function IconMoon() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconSun() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function IconLanguageEnglish() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="16" rx="4.5" fill="#1D4F91" />
      <path d="M2.5 7.2L8.8 12L2.5 16.8V20h2.46L12 14.6L19.04 20H21.5v-3.2L15.2 12l6.3-4.8V4h-2.46L12 9.4L4.96 4H2.5v3.2Z" fill="#F7F8FA" />
      <path d="M2.5 8.35L7.3 12L2.5 15.65V17.55L9.8 12L2.5 6.45v1.9Zm19 0v-1.9L14.2 12l7.3 5.55v-1.9L16.7 12l4.8-3.65Z" fill="#D94B4B" />
      <path d="M10.25 4h3.5v16h-3.5Z" fill="#F7F8FA" />
      <path d="M2.5 10.25h19v3.5h-19Z" fill="#F7F8FA" />
      <path d="M10.95 4h2.1v16h-2.1Z" fill="#D94B4B" />
      <path d="M2.5 10.95h19v2.1h-19Z" fill="#D94B4B" />
      <rect x="2.5" y="4" width="19" height="16" rx="4.5" stroke="rgba(12,24,44,0.18)" strokeWidth="1" />
    </svg>
  );
}

export function IconLanguageGerman() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="flag-de-clip">
          <rect x="2.5" y="4" width="19" height="16" rx="4.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-de-clip)">
        <rect x="2.5" y="4" width="19" height="5.34" fill="#141414" />
        <rect x="2.5" y="9.34" width="19" height="5.33" fill="#C73B3B" />
        <rect x="2.5" y="14.67" width="19" height="5.33" fill="#E2B93B" />
      </g>
      <rect x="2.5" y="4" width="19" height="16" rx="4.5" stroke="rgba(12,24,44,0.18)" strokeWidth="1" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconInfo() {
  return (
    <svg {...s} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
