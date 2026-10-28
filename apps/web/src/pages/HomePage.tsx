import { useTranslation } from "react-i18next";
import { LanguageToggle } from "../components/LanguageToggle";
import { StatusScreen } from "../components/StatusScreen";

export function HomePage() {
  const { t } = useTranslation();
  return (
    <StatusScreen
      icon="☕"
      title={t("common.appName")}
      text={`${t("common.tagline")}. ${t("home.text")}`}
      action={<LanguageToggle className="btn btn-secondary" />}
    />
  );
}
