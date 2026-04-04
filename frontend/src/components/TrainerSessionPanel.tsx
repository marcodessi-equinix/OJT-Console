import { useEffect, useState } from "react";
import { useLanguage } from "../features/language/LanguageProvider";
import type { TrainerSession } from "../types/training";
import { SignaturePad } from "./SignaturePad";

interface Props {
  trainer: TrainerSession | null;
  authBusy: boolean;
  profileBusy: boolean;
  authError: string | null;
  profileMessage: string | null;
  onLogin: (payload: { identifier: string; pin: string }) => Promise<void>;
  onLogout: () => void;
  onSaveProfile: (payload: { pin?: string; signatureDataUrl?: string }) => Promise<void>;
}

export function TrainerSessionPanel({
  trainer,
  authBusy,
  profileBusy,
  authError,
  profileMessage,
  onLogin,
  onLogout,
  onSaveProfile
}: Props) {
  const { messages } = useLanguage();
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [signatureValue, setSignatureValue] = useState("");

  useEffect(() => {
    setSignatureValue(trainer?.signatureDataUrl ?? "");
  }, [trainer]);

  useEffect(() => {
    if (trainer) {
      setOpen(false);
      setPin("");
    }
  }, [trainer]);

  async function handleLogin(): Promise<void> {
    await onLogin({ identifier, pin });
  }

  async function handleSaveProfile(): Promise<void> {
    await onSaveProfile({
      pin: newPin.trim() || undefined,
      signatureDataUrl: signatureValue
    });
    setNewPin("");
  }

  return (
    <div className="trainer-session-shell">
      <button
        type="button"
        className={`trainer-session-trigger ${trainer ? "signed-in" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="trainer-session-trigger-label">
          {trainer ? trainer.firstName || trainer.name : messages.auth.loginButton}
        </span>
        {trainer && <span className="badge badge-success">{messages.auth.signedIn}</span>}
      </button>

      {open && (
        <div className="trainer-session-popover">
          {!trainer ? (
            <div className="stack-md">
              <div>
                <span className="eyebrow">{messages.shell.topbarLogin}</span>
                <h3>{messages.auth.loginTitle}</h3>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trainer-login-identifier">{messages.auth.identifierLabel}</label>
                <input
                  id="trainer-login-identifier"
                  className="form-input"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={messages.auth.identifierPlaceholder}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trainer-login-pin">{messages.auth.pinLabel}</label>
                <input
                  id="trainer-login-pin"
                  className="form-input"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={messages.auth.pinPlaceholder}
                />
              </div>

              <p className="text-xs text-sec trainer-session-help">{messages.auth.loginHelp}</p>
              {authError && <p className="text-error text-sm">{authError}</p>}

              <button className="btn btn-primary" onClick={() => void handleLogin()} disabled={authBusy || identifier.trim().length < 2 || !/^\d{4}(\d{2})?$/.test(pin)}>
                {authBusy ? messages.auth.loginBusy : messages.auth.loginSubmit}
              </button>
            </div>
          ) : (
            <div className="stack-md">
              <div className="trainer-session-head">
                <div>
                  <span className="eyebrow">{messages.shell.topbarProfile}</span>
                  <h3>{trainer.name}</h3>
                  <p className="text-sm text-sec">{trainer.email}</p>
                </div>
                <button className="btn btn-sm" type="button" onClick={onLogout}>{messages.auth.logout}</button>
              </div>

              <p className="text-xs text-sec trainer-session-help">{messages.auth.profileHelp}</p>

              <SignaturePad
                title={messages.auth.signatureTitle}
                subtitle={messages.auth.signatureSubtitle}
                value={signatureValue}
                onChange={setSignatureValue}
              />

              <div className="form-group">
                <label className="form-label" htmlFor="trainer-new-pin">{messages.auth.newPinLabel}</label>
                <input
                  id="trainer-new-pin"
                  className="form-input"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={messages.auth.newPinPlaceholder}
                />
              </div>

              {authError && <p className="text-error text-sm">{authError}</p>}
              {profileMessage && <p className="text-sm trainer-session-success">{profileMessage}</p>}

              <button className="btn btn-primary" type="button" onClick={() => void handleSaveProfile()} disabled={profileBusy || (newPin.length > 0 && !/^\d{4}(\d{2})?$/.test(newPin))}>
                {profileBusy ? messages.auth.profileSaving : messages.auth.profileSave}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}