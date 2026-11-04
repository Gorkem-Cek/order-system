import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./AdminCafesPage.module.css";

/** Login details to hand to a café. The password isn't stored anywhere it can be shown again. */
export function Credentials({ email, password }: { email: string; password: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = `${t("admin.loginEmail")}: ${email}\n${t("admin.password")}: ${password}`;

  return (
    <div className={styles.credentials}>
      <p>{t("admin.credentialsText")}</p>
      <dl>
        <dt>{t("admin.loginEmail")}</dt>
        <dd>{email}</dd>
        <dt>{t("admin.password")}</dt>
        <dd>{password}</dd>
      </dl>
      <button
        type="button"
        className={styles.tool}
        onClick={() =>
          void navigator.clipboard
            ?.writeText(text)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? t("admin.copied") : t("admin.copy")}
      </button>
    </div>
  );
}
