import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { LanguageToggle } from "../../components/LanguageToggle";
import { ApiRequestError } from "../../lib/api";
import styles from "./LoginPage.module.css";
import { useLogin, useSession } from "./useSession";

export function LoginPage() {
  const { t } = useTranslation();
  const session = useSession();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (session.data) return <Navigate to="/staff" replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || login.isPending) return;
    login.mutate({ email, password });
  };

  const error =
    login.error instanceof ApiRequestError ? login.error.code : login.error && "UNKNOWN";
  const errorMessage =
    error === "INVALID_CREDENTIALS" || error === "VALIDATION_FAILED"
      ? t("login.errors.invalid")
      : error === "CAFE_INACTIVE"
        ? t("login.errors.cafeInactive")
        : error === "RATE_LIMITED"
          ? t("login.errors.rateLimited")
          : error === "NETWORK_ERROR"
            ? t("checkout.errors.network")
            : error && t("checkout.errors.generic");

  return (
    <main className={styles.page}>
      <title>{`${t("login.title")} · ${t("common.appName")}`}</title>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            ☕
          </span>
          <span>{t("common.appName")}</span>
          <LanguageToggle className={styles.lang} />
        </div>
        <h1 className={styles.title}>{t("login.title")}</h1>
        <p className={styles.subtitle}>{t("login.subtitle")}</p>

        {errorMessage && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            {t("login.email")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className={styles.field}>
            {t("login.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={login.isPending}>
            {login.isPending ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
