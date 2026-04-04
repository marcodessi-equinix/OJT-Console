import { useEffect, useState } from "react";
import { useLanguage } from "../features/language/LanguageProvider";
import type { AdminSession } from "../types/training";

interface Props {
  admin: AdminSession | null;
  authBusy: boolean;
  authError: string | null;
  onLogin: (payload: { identifier: string; pin: string }) => Promise<void>;
  onLogout: () => void;
}

export function AdminSessionPanel({ admin, authBusy, authError, onLogin, onLogout }: Props) {
  const { messages } = useLanguage();
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("admin");
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (admin) {
      setOpen(false);
      setPin("");
    }
  }, [admin]);

  async function handleLogin(): Promise<void> {
    await onLogin({ identifier, pin });
  }

  return (
    <div className="trainer-session-shell">
      <button
        type="button"
        className={`trainer-session-trigger ${admin ? "signed-in" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="trainer-session-trigger-label">
          {admin ? admin.name : messages.admin.loginButton}
        </span>
        {admin && <span className="badge badge-primary">{messages.admin.signedIn}</span>}
      </button>

      {open && (
        <div className="trainer-session-popover">
          {!admin ? (
            <div className="stack-md">
              <div>
                <span className="eyebrow">{messages.shell.topbarAdmin}</span>
                <h3>{messages.admin.loginTitle}</h3>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-login-identifier">{messages.admin.identifierLabel}</label>
                <input
                  id="admin-login-identifier"
                  className="form-input"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={messages.admin.identifierPlaceholder}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-login-pin">{messages.admin.pinLabel}</label>
                <input
                  id="admin-login-pin"
                  className="form-input"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={messages.admin.pinPlaceholder}
                />
              </div>

              <p className="text-xs text-sec trainer-session-help">{messages.admin.loginHelp}</p>
              {authError && <p className="text-error text-sm">{authError}</p>}

              <button className="btn btn-primary" onClick={() => void handleLogin()} disabled={authBusy || identifier.trim().length < 1 || !/^\d{4}(\d{2})?$/.test(pin)}>
                {authBusy ? messages.admin.loginBusy : messages.admin.loginSubmit}
              </button>
            </div>
          ) : (
            <div className="stack-md">
              <div className="trainer-session-head">
                <div>
                  <span className="eyebrow">{messages.shell.topbarAdmin}</span>
                  <h3>{admin.name}</h3>
                  <p className="text-sm text-sec">{admin.identifier}</p>
                </div>
                <button className="btn btn-sm" type="button" onClick={onLogout}>{messages.admin.logout}</button>
              </div>

              <p className="text-xs text-sec trainer-session-help">{messages.admin.activeHelp}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}