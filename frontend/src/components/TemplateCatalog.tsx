import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteTemplate as apiDeleteTemplate, uploadTemplate } from "../api/client";
import { getIntlLocale, useLanguage } from "../features/language/LanguageProvider";
import { formatDate } from "../utils/date";
import { DocxViewer } from "./DocxViewer";
import { IconFile, IconLanguageEnglish, IconLanguageGerman } from "./Icons";
import { UiSelect } from "./UiSelect";
import type { TemplateLanguage, TemplateTeam, TrainingTemplateSummary } from "../types/training";

const supportedUploadExtensions = [".doc", ".docx", ".pdf", ".txt"];

function isSupportedUploadFile(fileName: string): boolean {
  return supportedUploadExtensions.some((extension) => fileName.toLowerCase().endsWith(extension));
}

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

interface Props {
  templates: TrainingTemplateSummary[];
  canManageTemplates: boolean;
  visibleTeams: TemplateTeam[];
  onRefresh: () => Promise<void>;
}

function formatImportedAt(value: string, locale: string): string {
  return formatDate(value, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function resolveTemplateTeam(team: string | null | undefined): TemplateTeam {
  return team === "F-OPS" ? "F-OPS" : "C-OPS";
}

export function TemplateCatalog({
  templates,
  canManageTemplates,
  visibleTeams,
  onRefresh
}: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const groups = [
    {
      language: "English" as const,
      eyebrow: messages.documents.groups.English.eyebrow,
      title: messages.documents.groups.English.title,
      subtitle: messages.documents.groups.English.subtitle,
      Icon: IconLanguageEnglish
    },
    {
      language: "German" as const,
      eyebrow: messages.documents.groups.German.eyebrow,
      title: messages.documents.groups.German.title,
      subtitle: messages.documents.groups.German.subtitle,
      Icon: IconLanguageGerman
    }
  ];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadLanguage, setUploadLanguage] = useState<TemplateLanguage>("English");
  const [uploadTeam, setUploadTeam] = useState<TemplateTeam>("C-OPS");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<TrainingTemplateSummary | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const uploadLanguageOptions = [
    { value: "English", label: "English" },
    { value: "German", label: "German" }
  ];
  const uploadTeamOptions = [
    { value: "C-OPS", label: "C-OPS" },
    { value: "F-OPS", label: "F-OPS" }
  ];

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const supportedFiles = files.filter((file) => isSupportedUploadFile(file.name));
    const invalidFiles = files.filter((file) => !isSupportedUploadFile(file.name));

    if (!supportedFiles.length) {
      setUploadSuccess(null);
      setUploadError(messages.documents.uploadUnsupportedOnly);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const uploadResults = await Promise.allSettled(
        supportedFiles.map(async (file) => {
          const fileBase64 = await fileToBase64(file);
          const uploaded = await uploadTemplate({
            fileName: file.name,
            language: uploadLanguage,
            team: uploadTeam,
            fileBase64
          });

          return {
            fileName: file.name,
            template: uploaded
          };
        })
      );

      const uploadedFiles: Array<{ fileName: string; template: Awaited<ReturnType<typeof uploadTemplate>> }> = [];
      const failedFiles: string[] = [];

      uploadResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          uploadedFiles.push(result.value);
          return;
        }

        const reason = result.reason instanceof Error ? result.reason.message : messages.documents.uploadFailed;
        failedFiles.push(`${supportedFiles[index]?.name ?? "Datei"}: ${reason}`);
      });

      if (uploadedFiles.length) {
        await onRefresh();

        const lastUploaded = uploadedFiles[uploadedFiles.length - 1].template;
        setPreviewId(lastUploaded.id);
        setPreviewTitle(lastUploaded.sourceFile);
        setFullscreen(true);

        setUploadSuccess(
          uploadedFiles.length === 1
            ? (locale === "de"
              ? `"${lastUploaded.sourceFile}" erfolgreich hochgeladen (${lastUploaded.sectionCount} ${messages.documents.sectionsLabel}).`
              : `"${lastUploaded.sourceFile}" uploaded successfully (${lastUploaded.sectionCount} ${messages.documents.sectionsLabel}).`)
            : (locale === "de"
              ? `${uploadedFiles.length} Dokumente erfolgreich hochgeladen.`
              : `${uploadedFiles.length} documents uploaded successfully.`)
        );
      }

      const errorMessages = [
        invalidFiles.length ? `${messages.documents.uploadSkippedPrefix} ${invalidFiles.map((file) => file.name).join(", ")}` : null,
        failedFiles.length ? `${messages.documents.uploadFailedPrefix} ${failedFiles.join(" | ")}` : null
      ].filter((message): message is string => Boolean(message));

      if (!uploadedFiles.length && errorMessages.length) {
        setUploadError(errorMessages.join(" "));
      } else if (errorMessages.length) {
        setUploadError(errorMessages.join(" "));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : messages.documents.uploadFailed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openPreview(template: TrainingTemplateSummary, options?: { fullscreen?: boolean }) {
    setPreviewId(template.id);
    setPreviewTitle(template.sourceFile);
    setFullscreen(Boolean(options?.fullscreen));
  }

  useEffect(() => {
    if (!deleteCandidate) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deletingId) {
        setDeleteCandidate(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteCandidate, deletingId]);

  function handleDeleteRequest(template: TrainingTemplateSummary, event: React.MouseEvent) {
    event.stopPropagation();
    setDeleteCandidate(template);
  }

  async function handleDeleteConfirm() {
    if (!deleteCandidate) return;

    setDeletingId(deleteCandidate.id);
    try {
      await apiDeleteTemplate(deleteCandidate.id);
      if (previewId === deleteCandidate.id) { setPreviewId(null); setPreviewTitle(""); }
      setDeleteCandidate(null);
      await onRefresh();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="stack-md">
      {canManageTemplates && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">
              <span className="eyebrow">{messages.documents.uploadEyebrow}</span>
              <h2>{messages.documents.uploadTitle}</h2>
            </div>
          </div>
          <div className="card-body">
            <div className="template-upload-bar">
              <div className="form-group template-upload-language">
                <label className="form-label" htmlFor="upload-language">{messages.documents.uploadLanguage}</label>
                <UiSelect
                  id="upload-language"
                  value={uploadLanguage}
                  options={uploadLanguageOptions}
                  onChange={(value) => setUploadLanguage(value as TemplateLanguage)}
                />
              </div>
              <div className="form-group template-upload-team">
                <label className="form-label" htmlFor="upload-team">{messages.documents.uploadTeam}</label>
                <UiSelect
                  id="upload-team"
                  value={uploadTeam}
                  options={uploadTeamOptions}
                  onChange={(value) => setUploadTeam(value as TemplateTeam)}
                />
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".doc,.docx,.pdf,.txt,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  title={messages.documents.uploadDialogTitle}
                  aria-label={messages.documents.uploadDialogTitle}
                  className="template-upload-input"
                  onChange={handleFileSelected}
                  disabled={uploading}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? messages.documents.uploadBusy : messages.documents.uploadSelect}
                </button>
              </div>
            </div>
            <p className="template-upload-note text-sm text-sec">
              {messages.documents.uploadNote}
            </p>
            {uploadSuccess && <p className="template-upload-success text-sm">{uploadSuccess}</p>}
            {uploadError && <p className="template-upload-error text-error text-sm">{uploadError}</p>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <span className="eyebrow">{messages.documents.libraryEyebrow}</span>
            <h2>{messages.documents.libraryTitle}</h2>
          </div>
          <span className="badge badge-default">{templates.length} {messages.documents.libraryCountLabel}</span>
        </div>
        <div className="card-body flush">
          <div className="document-language-grid">
            {groups.map((group) => {
              const items = templates.filter((template) => template.language === group.language);
              const teamGroups = visibleTeams;

              return (
                <section key={group.language} className={`document-language-column document-language-column-${group.language.toLowerCase()}`}>
                  <div className={`document-language-head document-language-head-${group.language.toLowerCase()}`}>
                    <div className={`document-language-icon document-language-icon-${group.language.toLowerCase()}`}>
                      <group.Icon />
                    </div>
                    <div className="document-language-copy">
                      <span className="eyebrow">{group.eyebrow}</span>
                      <h3>{group.title}</h3>
                      <p>{group.subtitle}</p>
                    </div>
                    <span className="badge badge-default">{items.length}</span>
                  </div>

                  <div className="document-language-list">
                    {!items.length ? (
                      <div className="empty-state document-language-empty">{messages.documents.noDocumentsArea}</div>
                    ) : (
                      teamGroups.map((team) => {
                        const teamItems = items.filter((template) => resolveTemplateTeam(template.team) === team);

                        return (
                          <div key={`${group.language}-${team}`} className="document-team-section">
                            <div className="document-team-head">
                              <div>
                                <span className="eyebrow">{messages.documents.teamEyebrow}</span>
                                <h4>{team}</h4>
                              </div>
                              <span className="badge badge-default">{teamItems.length}</span>
                            </div>

                            {!teamItems.length ? (
                              <div className="document-team-empty">{messages.documents.noDocumentsForTeam} {team}.</div>
                            ) : (
                              <div className="document-team-list">
                                {teamItems.map((template) => (
                                  <div
                                    key={template.id}
                                    className={`document-card ${previewId === template.id ? "active" : ""}`}
                                  >
                                    <button
                                      type="button"
                                      className="document-card-open"
                                      onClick={() => openPreview(template, { fullscreen: true })}
                                    >
                                      <div className="document-card-main">
                                        <div className="document-card-icon">
                                          <IconFile />
                                        </div>
                                        <div className="document-card-copy">
                                          <div className="document-card-file-name">{template.sourceFile}</div>
                                          <div className="document-card-title">{template.title}</div>
                                          <div className="document-card-meta-row">
                                            <span>{template.sectionCount} {messages.documents.sectionsLabel}</span>
                                            <span>{messages.documents.importedPrefix} {formatImportedAt(template.importedAt, intlLocale)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                    {canManageTemplates && (
                                      <div className="document-card-actions">
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-danger"
                                          onClick={(event) => handleDeleteRequest(template, event)}
                                          disabled={deletingId === template.id}
                                        >
                                          {deletingId === template.id ? "..." : "×"}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && previewId && (
        <DocxViewer
          templateId={previewId}
          templateTitle={previewTitle}
          sourceFile={previewTitle}
          onClose={() => setFullscreen(false)}
          fullscreen
        />
      )}

      {deleteCandidate && createPortal(
        <div
          className="session-profile-overlay"
          onMouseDown={() => {
            if (!deletingId) {
              setDeleteCandidate(null);
            }
          }}
        >
          <section className="session-card session-profile-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="session-profile-head">
              <div>
                <span className="eyebrow">{messages.documents.libraryEyebrow}</span>
                <h3>{messages.common.actions.delete}</h3>
                <p className="text-sm text-sec">{messages.documents.deleteConfirm}</p>
              </div>

              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={Boolean(deletingId)}
              >
                {messages.common.actions.close}
              </button>
            </div>

            <div className="stack-md">
              <div className="session-card">
                <div className="document-card-copy">
                  <div className="document-card-file-name">{deleteCandidate.sourceFile}</div>
                  <div className="document-card-title">{deleteCandidate.title}</div>
                  <div className="document-card-meta-row">
                    <span>{deleteCandidate.sectionCount} {messages.documents.sectionsLabel}</span>
                    <span>{messages.documents.importedPrefix} {formatImportedAt(deleteCandidate.importedAt, intlLocale)}</span>
                  </div>
                </div>
              </div>

              <div className="emp-edit-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setDeleteCandidate(null)}
                  disabled={Boolean(deletingId)}
                >
                  {messages.common.actions.cancel}
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => void handleDeleteConfirm()}
                  disabled={Boolean(deletingId)}
                >
                  {deletingId === deleteCandidate.id ? "..." : messages.common.actions.delete}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
