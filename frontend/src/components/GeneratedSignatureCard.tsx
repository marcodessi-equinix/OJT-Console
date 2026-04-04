import { getIntlLocale, useLanguage } from "../features/language/LanguageProvider";

interface Props {
  title: string;
  subtitle?: string;
  value: string;
  readyHint: string;
  emptyHint: string;
}

export function GeneratedSignatureCard({ title, subtitle, value, readyHint, emptyHint }: Props) {
  const { locale, messages } = useLanguage();
  const hasSignature = Boolean(value);
  const sealTimestamp = new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());

  return (
    <div className="sig-card">
      <div className="sig-card-header">
        <div>
          <span className="eyebrow">{title}</span>
          {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
        </div>
      </div>
      {hasSignature ? (
        <div className="sig-preview">
          <img className="sig-preview-image" src={value} alt="" />
          <div className="sig-seal">
            <span className="sig-seal-label">{messages.delivery.digitalSealLabel}</span>
            <span className="sig-seal-time">{sealTimestamp}</span>
          </div>
        </div>
      ) : (
        <div className="sig-placeholder"><div className="sig-line" /></div>
      )}
      <span className="text-xs text-muted">{hasSignature ? readyHint : emptyHint}</span>
    </div>
  );
}