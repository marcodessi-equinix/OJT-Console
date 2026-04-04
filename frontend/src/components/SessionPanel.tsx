import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../features/language/LanguageProvider";
import type { AdminSession, TrainerSession } from "../types/training";
import { SignaturePad } from "./SignaturePad";
import { UiSelect } from "./UiSelect";

type LoginRole = "admin" | "trainer";
type PanelMode = "login" | "profile";

interface TrainerLoginOption {
  id: string;
  name: string;
  email: string;
  team: "C-OPS" | "F-OPS";
  hasPin: boolean;
}

interface Props {
  admin: AdminSession | null;
  trainer: TrainerSession | null;
  trainerOptions: TrainerLoginOption[];
  adminAuthBusy: boolean;
  adminAuthError: string | null;
  trainerAuthBusy: boolean;
  trainerAuthError: string | null;
  trainerProfileBusy: boolean;
  trainerProfileMessage: string | null;
  onAdminLogin: (payload: { pin: string }) => Promise<void>;
  onTrainerLogin: (payload: { identifier: string; pin: string }) => Promise<void>;
  onAdminLogout: () => void;
  onTrainerLogout: () => void;
  onTrainerProfileSave: (payload: { pin?: string; signatureDataUrl?: string }) => Promise<void>;
}

const pinPattern = /^\d{4}(\d{2})?$/;

export function SessionPanel({
  admin,
  trainer,
  trainerOptions,
  adminAuthBusy,
  adminAuthError,
  trainerAuthBusy,
  trainerAuthError,
  trainerProfileBusy,
  trainerProfileMessage,
  onAdminLogin,
  onTrainerLogin,
  onAdminLogout,
  onTrainerLogout,
  onTrainerProfileSave
}: Props) {
  const { messages } = useLanguage();
  const shellRef = useRef<HTMLDivElement>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [loginRole, setLoginRole] = useState<LoginRole>("trainer");
  const [trainerIdentifier, setTrainerIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [signatureValue, setSignatureValue] = useState("");
  const forcePinReset = Boolean(trainer?.mustChangePin);

  useEffect(() => {
    setSignatureValue(trainer?.signatureDataUrl ?? "");
  }, [trainer]);

  useEffect(() => {
    if (panelMode !== "login") {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (shellRef.current?.contains(target)) {
        return;
      }

      if (target instanceof Element && target.closest(".ui-select-menu")) {
        return;
      }

      setPanelMode(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [panelMode]);

  useEffect(() => {
    if (trainerOptions.length === 0) {
      setTrainerIdentifier("");
      return;
    }

    const trainerStillAvailable = trainerOptions.some((option) => option.email === trainerIdentifier);
    if (!trainerStillAvailable) {
      setTrainerIdentifier(trainerOptions[0]?.email ?? "");
    }
  }, [trainerIdentifier, trainerOptions]);

  const hasActiveSession = Boolean(admin || trainer);
  const loginBusy = loginRole === "admin" ? adminAuthBusy : trainerAuthBusy;
  const loginError = loginRole === "admin" ? adminAuthError : trainerAuthError;
  const trainerSelectOptions = useMemo(
    () => trainerOptions.map((option) => ({
      value: option.email,
      label: `${option.name} - ${option.team}`,
      description: option.email
    })),
    [trainerOptions]
  );
  const currentSession = trainer
    ? {
        roleLabel: messages.common.roles.trainer,
        badgeClass: "badge-success",
        name: trainer.name,
        detail: trainer.email,
        note: trainer.mustChangePin ? messages.auth.mustChangePinBadge : null
      }
    : admin
      ? {
          roleLabel: "Admin",
          badgeClass: "badge-primary",
          name: admin.name,
          detail: admin.identifier,
          note: null
        }
      : null;

  useEffect(() => {
    setPin("");
    setNewPin("");
    setPanelMode(trainer?.mustChangePin ? "profile" : null);
  }, [admin?.identifier, trainer?.id, trainer?.mustChangePin]);

  async function handleLoginSubmit(event?: React.FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    if (!pinPattern.test(pin) || loginBusy) {
      return;
    }

    try {
      if (loginRole === "admin") {
        await onAdminLogin({ pin });
        return;
      }

      if (!trainerIdentifier) {
        return;
      }

      await onTrainerLogin({ identifier: trainerIdentifier, pin });
    } catch {
      return;
    }
  }

  async function handleTrainerProfileSave(): Promise<void> {
    if (forcePinReset && !pinPattern.test(newPin)) {
      return;
    }

    await onTrainerProfileSave({
      pin: newPin.trim() || undefined,
      signatureDataUrl: signatureValue
    });
    setNewPin("");
    if (forcePinReset) {
      setPanelMode(null);
    }
  }

  return (
    <div className="trainer-session-shell" ref={shellRef}>
      {!hasActiveSession && (
        <button
          type="button"
          className="trainer-session-trigger"
          onClick={() => {
            setLoginRole("trainer");
            setPin("");
            setPanelMode((current) => current === "login" ? null : "login");
          }}
        >
          <span className="trainer-session-trigger-label">{messages.session.loginButton}</span>
        </button>
      )}

      {currentSession && (
        <div className="session-inline-actions">
          <div className="session-status">
            <span className={`badge ${currentSession.badgeClass}`}>{currentSession.roleLabel}</span>
            {trainer ? (
              <button
                className="session-status-copy session-status-copy-button"
                type="button"
                onClick={() => setPanelMode("profile")}
              >
                <strong className="session-status-name">{currentSession.name}</strong>
                <span className="session-status-detail">{currentSession.detail}</span>
                {currentSession.note && <span className="session-status-note">{currentSession.note}</span>}
              </button>
            ) : (
              <div className="session-status-copy">
                <strong className="session-status-name">{currentSession.name}</strong>
                <span className="session-status-detail">{currentSession.detail}</span>
              </div>
            )}
          </div>

          <button
            className="btn btn-sm"
            type="button"
            onClick={admin ? onAdminLogout : onTrainerLogout}
          >
            {admin ? messages.admin.logout : messages.auth.logout}
          </button>
        </div>
      )}

      {panelMode === "login" && (
        <div className="trainer-session-popover">
          <div className="stack-md">
            <section className="session-card session-card-login">
              <div>
                <span className="eyebrow">{messages.session.loginEyebrow}</span>
                <h3>{messages.session.loginTitle}</h3>
              </div>

              <form className="session-login-form" onSubmit={(event) => void handleLoginSubmit(event)}>
                <div className="form-group">
                  <span className="form-label">{messages.session.roleLabel}</span>
                  <div className="session-mode-toggle" aria-label={messages.session.roleLabel}>
                    <button
                      className={`session-mode-btn ${loginRole === "admin" ? "active" : ""}`}
                      type="button"
                      onClick={() => setLoginRole("admin")}
                    >
                      {messages.session.modeAdmin}
                    </button>
                    <button
                      className={`session-mode-btn ${loginRole === "trainer" ? "active" : ""}`}
                      type="button"
                      onClick={() => setLoginRole("trainer")}
                    >
                      {messages.session.modeTrainer}
                    </button>
                  </div>
                </div>

                {loginRole === "trainer" && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="session-login-trainer">{messages.session.trainerLabel}</label>
                    <UiSelect
                      id="session-login-trainer"
                      className="ui-select-block"
                      value={trainerIdentifier}
                      options={trainerSelectOptions}
                      onChange={setTrainerIdentifier}
                      disabled={trainerOptions.length === 0}
                      placeholder={messages.session.noTrainerOptions}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="session-login-pin">
                    {messages.session.pinLabel}
                  </label>
                  <input
                    id="session-login-pin"
                    className="form-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={messages.session.pinPlaceholder}
                  />
                </div>

                <p className="text-xs text-sec trainer-session-help session-login-help">
                  {loginRole === "admin" ? messages.session.loginHelpAdmin : messages.session.loginHelpTrainer}
                </p>
                {loginError && <p className="text-error text-sm">{loginError}</p>}

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={!pinPattern.test(pin) || loginBusy || (loginRole === "trainer" && !trainerIdentifier)}
                >
                  {loginRole === "admin"
                    ? (loginBusy ? messages.session.loginBusyAdmin : messages.session.loginSubmit)
                    : (loginBusy ? messages.session.loginBusyTrainer : messages.session.loginSubmit)}
                </button>
              </form>
            </section>
          </div>
        </div>
      )}

      {panelMode === "profile" && trainer && createPortal(
        <div
          className="session-profile-overlay"
          onMouseDown={() => {
            if (!forcePinReset) {
              setPanelMode(null);
            }
          }}
        >
          <section className="session-card session-profile-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="session-profile-head">
              <div>
                <span className="eyebrow">{messages.shell.topbarProfile}</span>
                <h3>{forcePinReset ? messages.auth.mustChangePinTitle : trainer.name}</h3>
                <p className="text-sm text-sec">{forcePinReset ? trainer.email : messages.auth.profileHelp}</p>
              </div>

              {!forcePinReset && (
                <button className="btn btn-sm" type="button" onClick={() => setPanelMode(null)}>
                  {messages.common.actions.close}
                </button>
              )}
            </div>

            {forcePinReset ? (
              <div className="stack-md">
                <p className="text-sm text-sec session-must-change-copy">{messages.auth.mustChangePinHelp}</p>

                <div className="form-group">
                  <label className="form-label" htmlFor="trainer-session-new-pin">{messages.auth.newPinLabel}</label>
                  <input
                    id="trainer-session-new-pin"
                    className="form-input"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={messages.auth.newPinPlaceholder}
                  />
                </div>

                {trainerAuthError && <p className="text-error text-sm">{trainerAuthError}</p>}

                <div className="emp-edit-actions">
                  <button className="btn btn-primary" type="button" onClick={() => void handleTrainerProfileSave()} disabled={trainerProfileBusy || !pinPattern.test(newPin)}>
                    {trainerProfileBusy ? messages.auth.profileSaving : messages.auth.mustChangePinSave}
                  </button>
                  <button className="btn btn-sm" type="button" onClick={onTrainerLogout}>
                    {messages.auth.logout}
                  </button>
                </div>
              </div>
            ) : (
              <div className="stack-md">
                <p className="text-xs text-sec trainer-session-help">{messages.auth.profileHelp}</p>

                <SignaturePad
                  title={messages.auth.signatureTitle}
                  subtitle={messages.auth.signatureSubtitle}
                  value={signatureValue}
                  onChange={setSignatureValue}
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="trainer-session-new-pin">{messages.auth.newPinLabel}</label>
                  <input
                    id="trainer-session-new-pin"
                    className="form-input"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={messages.auth.newPinPlaceholder}
                  />
                </div>

                {trainerAuthError && <p className="text-error text-sm">{trainerAuthError}</p>}
                {trainerProfileMessage && <p className="text-sm trainer-session-success">{trainerProfileMessage}</p>}

                <button className="btn btn-primary" type="button" onClick={() => void handleTrainerProfileSave()} disabled={trainerProfileBusy || (newPin.length > 0 && !pinPattern.test(newPin))}>
                  {trainerProfileBusy ? messages.auth.profileSaving : messages.auth.profileSave}
                </button>
              </div>
            )}
          </section>
        </div>,
        document.body
      )}

    </div>
  );
}