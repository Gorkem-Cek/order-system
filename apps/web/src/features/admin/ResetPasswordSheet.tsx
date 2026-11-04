import { newPasswordSchema, PASSWORD_MIN_LENGTH, type AdminCafe } from "@siparis/shared";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import styles from "./AdminCafesPage.module.css";
import { TextField } from "./TextField";
import { Credentials } from "./Credentials";
import { generatePassword } from "./generate";
import type { AdminCafeActions } from "./useAdminCafes";

export function ResetPasswordSheet({
  cafe,
  resetPassword,
  onClose,
}: {
  cafe: AdminCafe;
  resetPassword: AdminCafeActions["resetPassword"];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(generatePassword);
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!newPasswordSchema.safeParse(password).success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    resetPassword.mutate(
      { id: cafe.id, newPassword: password },
      { onSuccess: () => setDone(true) },
    );
  };

  if (done) {
    return (
      <Sheet
        title={t("admin.passwordResetTitle", { name: cafe.name })}
        onClose={onClose}
        footer={
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            {t("admin.done")}
          </button>
        }
      >
        <Credentials email={cafe.loginEmail ?? ""} password={password} />
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t("admin.resetPasswordTitle", { name: cafe.name })}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="reset-password"
          className="btn btn-primary btn-block"
          disabled={resetPassword.isPending}
        >
          {t("admin.resetPassword")}
        </button>
      }
    >
      <form id="reset-password" className={styles.form} onSubmit={submit} noValidate>
        <p className={styles.fieldHint}>{t("admin.resetPasswordText")}</p>
        <div className={styles.passwordRow}>
          <TextField
            label={t("admin.newPassword")}
            value={password}
            onChange={setPassword}
            error={invalid ? t("admin.errors.password", { min: PASSWORD_MIN_LENGTH }) : undefined}
            maxLength={200}
          />
          <button
            type="button"
            className={styles.tool}
            onClick={() => setPassword(generatePassword())}
          >
            {t("admin.generate")}
          </button>
        </div>
        {resetPassword.isError && (
          <p className={styles.error} role="alert">
            {t("admin.errors.generic")}
          </p>
        )}
      </form>
    </Sheet>
  );
}
