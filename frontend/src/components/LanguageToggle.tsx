import { useLanguage } from "../features/language/LanguageProvider";

export function LanguageToggle() {
  const { locale, setLocale, messages } = useLanguage();

  return (
    <div className="app-language-toggle" aria-label={messages.language.ariaLabel}>
      <button
        type="button"
        className={`app-language-btn ${locale === "de" ? "active" : ""}`}
        onClick={() => setLocale("de")}
      >
        {messages.language.de}
      </button>
      <button
        type="button"
        className={`app-language-btn ${locale === "en" ? "active" : ""}`}
        onClick={() => setLocale("en")}
      >
        {messages.language.en}
      </button>
    </div>
  );
}