import { PASSWORD_MIN_LENGTH, type ChangePasswordRequest } from "@siparis/shared";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiFetch, ApiRequestError } from "../../lib/api";
import styles from "./SettingsPage.module.css";

/** Changes the logged-in user's password; the server signs out their other sessions. */
export function PasswordForm() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      apiFetch("/auth/password", z.undefined(), { method: "POST", body: JSON.stringify(body) }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.reset();
    const found =
      next.length < PASSWORD_MIN_LENGTH
        ? t("password.errors.tooShort", { min: PASSWORD_MIN_LENGTH })
        : next !== repeat
          ? t("password.errors.mismatch")
          : next === current
            ? t("password.errors.same")
            : null;
    setProblem(found);
    if (found) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setRepeat("");
        },
      },
    );
  };

  const serverError =
    change.error instanceof ApiRequestError && change.error.code === "INVALID_CREDENTIALS"
      ? t("password.errors.wrongCurrent")
      : change.error instanceof ApiRequestError && change.error.code === "RATE_LIMITED"
        ? t("password.errors.rateLimited")
        : change.error
          ? t("password.errors.generic")
          : null;
  const error = problem ?? serverError;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span>{t("password.current")}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label className={styles.field}>
        <span>{t("password.new")}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </label>
      <label className={styles.field}>
        <span>{t("password.repeat")}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          required
        />
      </label>
      <div className={styles.actions}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!current || !next || !repeat || change.isPending}
        >
          {change.isPending ? t("password.submitting") : t("password.submit")}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {change.isSuccess && (
        <p className={styles.success} role="status">
          {t("password.done")}
        </p>
      )}
    </form>
  );
}
