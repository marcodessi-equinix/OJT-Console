import { useMemo, useState } from "react";
import { getIntlLocale, useLanguage } from "../features/language/LanguageProvider";
import type { AppMessages } from "../features/language/i18n";
import type { EmployeeProfile, TrainingSection, TrainingTemplate } from "../types/training";
import { IconCheck } from "./Icons";

type TrainingBlock =
  | { type: "subheading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; heading?: string; items: string[] }
  | { type: "callout"; tone: "note" | "instruction"; label: string; text: string };

type SectionGroup = {
  id: string;
  kind: "intro" | "session" | "signoff";
  title: string;
  kicker: string;
  sectionIndexes: number[];
};

const namedSectionHeadings = new Set([
  "objective",
  "ziel",
  "time requirements",
  "zeitbedarf",
  "trainee prerequisites",
  "voraussetzungen fur den trainee",
  "discussion preparation",
  "diskussionsvorbereitung",
  "introduction",
  "einfuhrung",
  "instructor discussion",
  "diskussion mit dem kursleiter",
  "demonstration and practice",
  "demonstration und praxis",
  "ojt signoff",
  "ojt abmelden"
]);

const signoffTitles = new Set(["ojt signoff", "ojt abmelden"]);

function normalizeLabel(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s*[-–]\s*$/g, "").trim();
}

function splitSentenceItems(value: string): string[] {
  return (value.match(/[^.!?;]+[.!?;]?/g) ?? [value])
    .map((item) => cleanText(item).replace(/[.;:]$/, ""))
    .filter(Boolean);
}

function isLikelyHeading(value: string): boolean {
  const trimmed = value.replace(/[:.]$/, "").trim();
  const normalized = normalizeLabel(trimmed);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  return namedSectionHeadings.has(normalized)
    || /^session \d+/i.test(normalized)
    || /^sitzung \d+/i.test(normalized)
    || (trimmed.length <= 72 && wordCount <= 8 && !/[.!?]$/.test(trimmed));
}

function isLikelyListLine(value: string): boolean {
  const trimmed = value.replace(/^[\u2022\-*]\s*/, "").trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  return Boolean(trimmed) && trimmed.length <= 120 && wordCount <= 18 && !isLikelyHeading(trimmed);
}

function detectCallout(value: string): TrainingBlock | null {
  const colonIndex = value.indexOf(":");
  if (colonIndex <= 0 || colonIndex > 24) {
    return null;
  }

  const label = value.slice(0, colonIndex).trim();
  const text = value.slice(colonIndex + 1).trim();
  const normalized = normalizeLabel(label);

  if (!text) {
    return null;
  }

  if (["note", "hinweis", "important", "wichtig"].includes(normalized)) {
    return { type: "callout", tone: "note", label, text };
  }

  if (["instructor", "teacher", "trainer", "kursleiter", "ausbilder", "lehrer"].includes(normalized)) {
    return { type: "callout", tone: "instruction", label, text };
  }

  return null;
}

function detectInlineList(value: string): { heading?: string; items: string[] } | null {
  const colonIndex = value.indexOf(":");
  if (colonIndex > 0 && colonIndex < 42) {
    const heading = value.slice(0, colonIndex).trim();
    const items = splitSentenceItems(value.slice(colonIndex + 1));

    if (items.length >= 2) {
      return { heading, items };
    }
  }

  const items = splitSentenceItems(value);
  const averageLength = items.reduce((sum, item) => sum + item.length, 0) / Math.max(items.length, 1);

  if (items.length >= 4 && averageLength <= 95) {
    return { items };
  }

  return null;
}

function buildTrainingBlocks(content: string): TrainingBlock[] {
  const paragraphs = content.split(/\n+/).map(cleanText).filter(Boolean);
  const blocks: TrainingBlock[] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const current = paragraphs[index];
    const callout = detectCallout(current);

    if (callout) {
      blocks.push(callout);
      continue;
    }

    if (isLikelyHeading(current)) {
      const items: string[] = [];
      let nextIndex = index + 1;

      while (nextIndex < paragraphs.length && isLikelyListLine(paragraphs[nextIndex])) {
        items.push(paragraphs[nextIndex].replace(/^[\u2022\-*]\s*/, ""));
        nextIndex += 1;
      }

      blocks.push({ type: "subheading", text: current.replace(/:$/, "") });

      if (items.length >= 2) {
        blocks.push({ type: "list", items });
        index = nextIndex - 1;
      }

      continue;
    }

    const inlineList = detectInlineList(current);
    if (inlineList) {
      blocks.push({ type: "list", heading: inlineList.heading, items: inlineList.items });
      continue;
    }

    blocks.push({ type: "paragraph", text: current });
  }

  return blocks;
}

function formatImportedDate(value: string, locale: string, messages: AppMessages): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return messages.training.importedUnknown;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsed);
}

function isSessionTitle(value: string): boolean {
  const normalized = normalizeLabel(cleanTitle(value));
  return /^session \d+/i.test(normalized) || /^sitzung \d+/i.test(normalized);
}

function isSignoffTitle(value: string): boolean {
  return signoffTitles.has(normalizeLabel(cleanTitle(value)));
}

function getIntroTitle(messages: AppMessages): string {
  return messages.training.introTitle;
}

function getIntroKicker(messages: AppMessages): string {
  return messages.training.introKicker;
}

function getSignoffKicker(messages: AppMessages): string {
  return messages.training.signoffKicker;
}

function extractSessionNumber(title: string): string {
  const match = cleanTitle(title).match(/(?:session|sitzung)\s+(\d+)/i);
  return match?.[1] ?? "";
}

function buildSectionGroups(template: TrainingTemplate, messages: AppMessages): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let currentGroup: SectionGroup | undefined;

  for (let index = 0; index < template.sections.length; index += 1) {
    const section = template.sections[index];
    const title = cleanTitle(section.title);

    if (isSignoffTitle(title)) {
      if (currentGroup?.sectionIndexes.length) {
        groups.push(currentGroup);
      }

      currentGroup = {
        id: `signoff-${index}`,
        kind: "signoff",
        title: title || messages.training.signoffFallbackTitle,
        kicker: getSignoffKicker(messages),
        sectionIndexes: [index]
      };
      continue;
    }

    if (isSessionTitle(title)) {
      if (currentGroup?.sectionIndexes.length) {
        groups.push(currentGroup);
      }

      currentGroup = {
        id: `session-${index}`,
        kind: "session",
        title,
        kicker: messages.training.sessionKicker,
        sectionIndexes: [index]
      };
      continue;
    }

    if (!currentGroup) {
      currentGroup = {
        id: "intro",
        kind: "intro",
        title: getIntroTitle(messages),
        kicker: getIntroKicker(messages),
        sectionIndexes: []
      };
    }

    currentGroup.sectionIndexes.push(index);
  }

  if (currentGroup?.sectionIndexes.length) {
    groups.push(currentGroup);
  }

  return groups;
}

function shouldShowSectionTitle(section: TrainingSection): boolean {
  return Boolean(cleanTitle(section.title));
}

interface Props {
  template: TrainingTemplate;
  employee: EmployeeProfile;
  currentIndex: number;
  isCompleted?: boolean;
  onSelectIndex: (i: number) => void;
  onEditSection?: (sectionId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onCompleteTraining?: () => void;
}

export function TrainingStepper({ template, employee, currentIndex, isCompleted = false, onSelectIndex, onEditSection, onCompleteTraining }: Props) {
  const { locale, messages } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => buildSectionGroups(template, messages), [messages, template]);
  const currentGroupIndex = Math.max(0, groups.findIndex((group) => group.sectionIndexes.includes(currentIndex)));
  const activeGroup = groups[currentGroupIndex] ?? groups[0];

  if (!activeGroup) {
    return null;
  }

  const activeRawIndexes = activeGroup.sectionIndexes;
  const activeSections = activeRawIndexes.map((index) => template.sections[index]);

  const sectionBlocksMap = useMemo(() => {
    const map = new Map<string, TrainingBlock[]>();
    for (const section of activeSections) {
      map.set(section.id, buildTrainingBlocks(section.content));
    }
    return map;
  }, [activeSections]);
  const previousGroup = groups[currentGroupIndex - 1];
  const nextGroup = groups[currentGroupIndex + 1];
  const progress = groups.length ? ((currentGroupIndex + 1) / groups.length) * 100 : 0;
  const sourceLabel = template.sourceFile.replace(/\.(docx|doc|pdf|txt)$/i, "");
  const isLastGroup = currentGroupIndex === groups.length - 1;
  const helperCopy = isLastGroup
    ? messages.training.flowFinalCopy
    : messages.training.flowNextCopy;

  function renderBlocks(blocks: TrainingBlock[], prefix: string) {
    return blocks.map((block, index) => {
      if (block.type === "subheading") {
        return (
          <div key={`${prefix}-${block.type}-${index}`} className="training-subheading-block">
            <h4>{block.text}</h4>
          </div>
        );
      }

      if (block.type === "callout") {
        return (
          <div key={`${prefix}-${block.type}-${index}`} className={`training-callout training-callout-${block.tone}`}>
            <span className="training-callout-label">{block.label}</span>
            <p>{block.text}</p>
          </div>
        );
      }

      if (block.type === "list") {
        return (
          <div key={`${prefix}-${block.type}-${index}`} className="training-list-block">
            {block.heading && <h4>{block.heading}</h4>}
            <ol className="training-list">
              {block.items.map((item, itemIndex) => (
                <li key={`${prefix}-${itemIndex}`}>
                  <span className="training-list-index">{String(itemIndex + 1).padStart(2, "0")}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      }

      return (
        <div key={`${prefix}-${block.type}-${index}`} className="training-paragraph-block">
          <p>{block.text}</p>
        </div>
      );
    });
  }

  function startEditing(section: TrainingSection) {
    setEditingSectionId(section.id);
    setEditTitle(section.title);
    setEditContent(section.content);
  }

  async function saveEditing() {
    if (!editingSectionId || !onEditSection) return;
    setSaving(true);
    try {
      await onEditSection(editingSectionId, { title: editTitle, content: editContent });
      setEditingSectionId(null);
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setEditingSectionId(null);
  }

  function renderSectionPanel(section: TrainingSection, rawIndex: number) {
    const showTitle = shouldShowSectionTitle(section);
    const sectionBlocks = sectionBlocksMap.get(section.id) ?? buildTrainingBlocks(section.content);

    return (
      <section key={section.id} className={`training-section-panel ${activeGroup.kind === "intro" ? "training-section-panel-intro" : ""}`}>
        {showTitle && (
          <div className="training-section-panel-head">
            <h3>{cleanTitle(section.title)}</h3>
            {onEditSection && (
              <button className="btn btn-sm" onClick={() => startEditing(section)}>{messages.training.editButton}</button>
            )}
          </div>
        )}
        {!showTitle && onEditSection && (
          <div className="training-section-panel-head training-section-panel-head-minimal">
            <button className="btn btn-sm" onClick={() => startEditing(section)}>{messages.training.editButton}</button>
          </div>
        )}
        {editingSectionId === section.id ? (
          <div className="training-edit-panel">
            <div className="form-group">
              <label className="form-label" htmlFor={`training-edit-title-${section.id}`}>{messages.training.titleLabel}</label>
              <input id={`training-edit-title-${section.id}`} className="form-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`training-edit-content-${section.id}`}>{messages.training.contentLabel}</label>
              <textarea id={`training-edit-content-${section.id}`} className="form-input training-edit-textarea" rows={12} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
            </div>
            <div className="training-edit-actions">
              <button className="btn" onClick={cancelEditing}>{messages.common.actions.cancel}</button>
              <button className="btn btn-primary" onClick={() => void saveEditing()} disabled={saving}>{saving ? messages.common.actions.saving : messages.common.actions.save}</button>
            </div>
          </div>
        ) : (
          <div className="training-section-panel-body">
            {renderBlocks(sectionBlocks, section.id)}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="training-stage">
      <section className={`card training-stage-hero training-stage-hero-${activeGroup.kind}`}>
        <div className="training-stage-hero-main">
          <div className="training-stage-progress-wrap">
            <span className="eyebrow">{activeGroup.kicker}</span>
            <div className="progress-wrap progress-wrap-offset">
              <progress className="progress-bar" value={progress} max={100} />
              <span className="progress-text">{currentGroupIndex + 1}/{groups.length}</span>
            </div>
          </div>

          <div className="training-stage-copy">
            <h2>{activeGroup.kind === "intro" ? template.title : activeGroup.title}</h2>
            <p>
              {activeGroup.kind === "intro"
                ? messages.training.documentIntroCopy
                : activeGroup.kind === "signoff"
                  ? messages.training.documentSignoffCopy
                  : messages.training.documentSessionCopy}
            </p>
          </div>
        </div>

        <div className="training-stage-context-grid">
          <div className="training-stage-context-item">
            <span>{messages.training.employeeLabel}</span>
            <strong>{employee.name}</strong>
            <small>{employee.team}</small>
          </div>
          <div className="training-stage-context-item">
            <span>{messages.training.templateLabel}</span>
            <strong>{template.title}</strong>
            <small>{messages.common.templateLanguages[template.language]}</small>
          </div>
          <div className="training-stage-context-item">
            <span>{messages.training.importedLabel}</span>
            <strong>{formatImportedDate(template.importedAt, intlLocale, messages)}</strong>
            <small>{messages.training.navigationEyebrow}</small>
          </div>
          <div className="training-stage-context-item">
            <span>{messages.training.sourceLabel}</span>
            <strong>{sourceLabel}</strong>
            <small>{activeSections.length} {messages.training.contentsLabel}</small>
          </div>
        </div>
      </section>

      <section className="card training-topic-rail-card">
        <div className="card-body compact">
          <div className="training-topic-rail-head">
            <div>
              <span className="eyebrow">{messages.training.documentStructureEyebrow}</span>
              <h3 className="training-review-title">{messages.training.navigationEyebrow}</h3>
            </div>
            <div className="training-review-progress">{currentGroupIndex + 1}/{groups.length} {messages.training.stepProgressLabel}</div>
          </div>

          <nav className="training-topic-rail" aria-label={messages.training.navigationEyebrow}>
            {groups.map((group, groupIndex) => {
              const groupDone = groupIndex < currentGroupIndex || (isCompleted && groupIndex === currentGroupIndex);
              const sessionNumber = extractSessionNumber(group.title);
              const stepLabel = group.kind === "intro"
                ? "I"
                : group.kind === "signoff"
                  ? "S"
                  : sessionNumber || String(groupIndex + 1);
              const cls = [
                "training-topic-pill",
                groupIndex === currentGroupIndex ? "active" : "",
                groupDone ? "done" : ""
              ].filter(Boolean).join(" ");

              return (
                <button key={group.id} type="button" className={cls} onClick={() => onSelectIndex(group.sectionIndexes[0])}>
                  <span className="training-topic-pill-num">{groupDone ? <IconCheck /> : stepLabel}</span>
                  <span className="training-topic-pill-copy">
                    <strong>{group.title}</strong>
                    <small>{group.sectionIndexes.length} {messages.training.contentsLabel}</small>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </section>

      <section className={`card training-stage-document training-stage-document-${activeGroup.kind}`}>
        <div className="training-stage-document-head">
          <div>
            <span className="eyebrow">{messages.training.currentTopicLabel}</span>
            <h3 className="training-review-title">{activeGroup.title}</h3>
            <p className="training-flow-copy">{helperCopy}</p>
          </div>
          <div className="training-flow-grid">
            <div className="training-flow-stat">
              <span>{messages.training.currentTopicLabel}</span>
              <strong>{activeGroup.title}</strong>
              <small>{activeSections.length} {messages.training.contentsLabel}</small>
            </div>
            <div className="training-flow-stat">
              <span>{nextGroup ? messages.training.nextTopicLabel : messages.training.finalStepLabel}</span>
              <strong>{nextGroup?.title ?? messages.training.completeTitle}</strong>
              <small>{nextGroup ? messages.training.flowNextCopy : messages.training.completeCopy}</small>
            </div>
          </div>
        </div>

        <div className="training-stage-document-body">
          {activeRawIndexes.map((rawIndex) => renderSectionPanel(template.sections[rawIndex], rawIndex))}
        </div>
      </section>

      <section className="card training-stage-footer">
        <div className="card-body compact">
          <div className="training-stage-footer-bar">
            <button className="btn" onClick={() => previousGroup && onSelectIndex(previousGroup.sectionIndexes[0])} disabled={!previousGroup}>
              {messages.common.actions.back}
            </button>

            <div className="training-stage-footer-center">
              <strong>{activeGroup.title}</strong>
              <span>{helperCopy}</span>
            </div>

            {isLastGroup && onCompleteTraining ? (
              <button className="btn btn-primary" onClick={onCompleteTraining}>
                {messages.training.completeButton}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => nextGroup && onSelectIndex(nextGroup.sectionIndexes[0])} disabled={!nextGroup}>
                {messages.common.actions.next}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
