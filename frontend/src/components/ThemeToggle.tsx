import { useTheme } from "../features/theme/ThemeProvider";
import { useLanguage } from "../features/language/LanguageProvider";
import { IconMoon, IconSun } from "./Icons";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { messages } = useLanguage();
  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} title={theme === "light" ? messages.theme.toDark : messages.theme.toLight}>
      {theme === "light" ? <IconMoon /> : <IconSun />}
    </button>
  );
}
