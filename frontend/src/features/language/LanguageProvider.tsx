import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import i18n, { translations, type AppMessages } from "./i18n";

export type AppLocale = "de" | "en";

export function getIntlLocale(locale: AppLocale): string {
  return locale === "de" ? "de-DE" : "en-US";
}

export function getSortLocale(locale: AppLocale): string {
  return locale === "de" ? "de" : "en";
}

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  messages: AppMessages;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useLocalStorageState<AppLocale>("ojt-locale", "de");

  useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale]);

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        messages: translations[locale]
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("LanguageProvider is missing.");
  }

  return context;
}