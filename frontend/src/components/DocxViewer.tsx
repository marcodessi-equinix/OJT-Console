import { useCallback, useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { useLanguage } from "../features/language/LanguageProvider";
import type { TrainingTemplate } from "../types/training";

interface Props {
  templateId: string;
  templateTitle: string;
  sourceFile: string;
  onClose: () => void;
  fullscreen?: boolean;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

function getSourceExtension(fileName: string): ".doc" | ".docx" | ".pdf" | ".txt" | "" {
  const normalized = fileName.toLowerCase();

  if (normalized.endsWith(".docx")) return ".docx";
  if (normalized.endsWith(".doc")) return ".doc";
  if (normalized.endsWith(".pdf")) return ".pdf";
  if (normalized.endsWith(".txt")) return ".txt";

  return "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplateSections(template: TrainingTemplate): string {
  return template.sections
    .map(
      (section) => `
        <section class="docx-viewer-section">
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.content).replace(/\n/g, "<br />")}</p>
        </section>
      `
    )
    .join("");
}

export function DocxViewer({ templateId, templateTitle, sourceFile, onClose, fullscreen }: Props) {
  const { messages } = useLanguage();
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [useDocxPreview, setUseDocxPreview] = useState(false);
  const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer | null>(null);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setHtml(null);
      setText(null);
      setPdfUrl(null);
      setUseDocxPreview(false);
      setDocxBuffer(null);

      try {
        const sourceExtension = getSourceExtension(sourceFile);

        if (sourceExtension === ".pdf") {
          if (!cancelled) setPdfUrl(`${apiBaseUrl}/templates/${encodeURIComponent(templateId)}/file`);
          return;
        }

        if (sourceExtension === ".docx" || sourceExtension === ".doc") {
          const res = await fetch(`${apiBaseUrl}/templates/${encodeURIComponent(templateId)}/file`);
          if (!res.ok) {
            const body = await res.json().catch(() => null) as { message?: string } | null;
            throw new Error(body?.message ?? messages.preview.loadFailed);
          }
          const arrayBuffer = await res.arrayBuffer();

          // Try docx-preview for faithful rendering
          try {
            if (!cancelled) {
              setDocxBuffer(arrayBuffer);
              setUseDocxPreview(true);
            }
            return;
          } catch {
            // docx-preview failed — fall through
          }

          // Fallback for .doc: show parsed sections
          if (sourceExtension === ".doc") {
            const templateRes = await fetch(`${apiBaseUrl}/templates/${encodeURIComponent(templateId)}`);
            if (!templateRes.ok) {
              const body = await templateRes.json().catch(() => null) as { message?: string } | null;
              throw new Error(body?.message ?? messages.preview.loadFailed);
            }
            const template = await templateRes.json() as TrainingTemplate;
            if (!cancelled) setHtml(renderTemplateSections(template));
            return;
          }

          return;
        }

        if (sourceExtension === ".txt") {
          const res = await fetch(`${apiBaseUrl}/templates/${encodeURIComponent(templateId)}/file`);
          if (!res.ok) {
            const body = await res.json().catch(() => null) as { message?: string } | null;
            throw new Error(body?.message ?? messages.preview.loadFailed);
          }
          const content = await res.text();
          if (!cancelled) setText(content);
          return;
        }

        throw new Error(messages.preview.unsupportedType);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : messages.preview.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [sourceFile, templateId]);

  // Render docx-preview into the container once both buffer and container are ready
  useEffect(() => {
    if (!useDocxPreview || !docxBuffer || !docxContainerRef.current) return;
    const container = docxContainerRef.current;
    container.innerHTML = "";

    renderAsync(docxBuffer, container, undefined, {
      className: "docx-preview-wrapper",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true
    }).catch((err) => {
      // docx-preview failed — fall back to section rendering for .doc
      console.warn("docx-preview failed:", err);
      const ext = getSourceExtension(sourceFile);
      if (ext === ".doc") {
        fetch(`${apiBaseUrl}/templates/${encodeURIComponent(templateId)}`)
          .then((r) => r.json())
          .then((template) => {
            setUseDocxPreview(false);
            setDocxBuffer(null);
            setHtml(renderTemplateSections(template as TrainingTemplate));
          })
          .catch(() => setError(messages.preview.renderFailed));
      } else {
        setError(messages.preview.renderFailed);
      }
    });
  }, [useDocxPreview, docxBuffer, sourceFile, templateId, messages.preview.renderFailed]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const content = (
    <>
      {loading && !useDocxPreview && <div className="empty-state">{messages.preview.loading}</div>}
      {error && <div className="empty-state text-error">{error}</div>}
      {pdfUrl && <iframe className="docx-viewer-frame" src={pdfUrl} title={templateTitle} />}
      {text && <pre className="docx-viewer-text">{text}</pre>}
      {useDocxPreview && <div ref={docxContainerRef} className="docx-preview-container" />}
      {html && (
        <div
          className="docx-viewer-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </>
  );

  if (!fullscreen) {
    return (
      <div className="docx-viewer-inline">
        {content}
      </div>
    );
  }

  return (
    <div className="docx-viewer-overlay" onClick={onClose}>
      <div className="docx-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="docx-viewer-header">
          <h2>{templateTitle}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {messages.preview.close} ✕
          </button>
        </div>
        <div className="docx-viewer-body">{content}</div>
      </div>
    </div>
  );
}
