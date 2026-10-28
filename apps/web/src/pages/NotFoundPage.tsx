import { useTranslation } from "react-i18next";
import { StatusScreen } from "../components/StatusScreen";

export function NotFoundPage() {
  const { t } = useTranslation();
  return <StatusScreen icon="🧭" title={t("notFound.title")} text={t("notFound.text")} />;
}
