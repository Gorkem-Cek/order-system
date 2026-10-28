import { useTranslation } from "react-i18next";

/** Switches the interface between Turkish and English. */
export function LanguageToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const next = i18n.language === "en" ? "tr" : "en";
  return (
    <button
      type="button"
      className={className}
      lang={next}
      onClick={() => void i18n.changeLanguage(next)}
      aria-label={`${t("common.language")}: ${t("common.switchLanguage")}`}
    >
      {next.toUpperCase()}
    </button>
  );
}
