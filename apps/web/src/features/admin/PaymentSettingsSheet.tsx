import {
  updateCafePaymentRequestSchema,
  type AdminCafe,
  type CafePaymentSettings,
  type IyzicoMode,
} from "@siparis/shared";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import { ApiRequestError } from "../../lib/api";
import styles from "./AdminCafesPage.module.css";
import { TextField } from "./TextField";
import { usePaymentSettings } from "./useAdminCafes";

/** The café's iyzico account and address. Loads the saved settings first. */
export function PaymentSettingsSheet({ cafe, onClose }: { cafe: AdminCafe; onClose: () => void }) {
  const { t } = useTranslation();
  const { settings } = usePaymentSettings(cafe.id);

  return (
    <Sheet title={t("admin.payment.title", { name: cafe.name })} onClose={onClose}>
      {settings.isPending && <p className={styles.fieldHint}>{t("common.loading")}</p>}
      {settings.isError && (
        <p className={styles.error} role="alert">
          {t("admin.errors.generic")}
        </p>
      )}
      {settings.data && <PaymentForm cafe={cafe} saved={settings.data} onClose={onClose} />}
    </Sheet>
  );
}

type Field = "address" | "city" | "keys";

function PaymentForm({
  cafe,
  saved,
  onClose,
}: {
  cafe: AdminCafe;
  saved: CafePaymentSettings;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { save, remove } = usePaymentSettings(cafe.id);
  const [mode, setMode] = useState<IyzicoMode>(saved.mode ?? "SANDBOX");
  const [address, setAddress] = useState(saved.address ?? "");
  const [city, setCity] = useState(saved.city ?? "");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const keepsKeys = saved.mode !== null && saved.mode === mode;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    const found: Partial<Record<Field, string>> = {};
    const typed = apiKey.trim() || secretKey.trim();
    if (address.trim().length < 5) found.address = t("admin.payment.errors.address");
    if (city.trim().length < 2) found.city = t("admin.payment.errors.city");
    if ((typed || !keepsKeys) && (apiKey.trim().length < 10 || secretKey.trim().length < 10)) {
      found.keys = t("admin.payment.errors.keys");
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body = updateCafePaymentRequestSchema.parse({
      mode,
      address,
      city,
      ...(typed && { apiKey, secretKey }),
    });
    save.mutate(body, {
      onSuccess: () => {
        setApiKey("");
        setSecretKey("");
      },
    });
  };

  const code = save.error instanceof ApiRequestError ? save.error.code : null;
  const saveError =
    code === "PAYMENT_KEYS_REJECTED"
      ? t("admin.payment.errors.rejected")
      : code === "PAYMENT_PROVIDER_UNAVAILABLE"
        ? t("admin.payment.errors.unavailable")
        : save.error
          ? t("admin.errors.generic")
          : null;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.fieldHint}>{t("admin.payment.hint")}</p>
      <p className={styles.paymentStatus} data-mode={saved.mode ?? "NONE"}>
        {saved.mode
          ? t("admin.payment.connected", {
              mode: t(`admin.payment.modes.${saved.mode}`),
              ending: saved.apiKeyEnding,
            })
          : t("admin.payment.notConnected")}
      </p>

      <fieldset className={styles.modes}>
        <legend>{t("admin.payment.mode")}</legend>
        {(["SANDBOX", "LIVE"] as const).map((value) => (
          <label key={value} className={styles.mode}>
            <input
              type="radio"
              name="iyzico-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            <span>
              <strong>{t(`admin.payment.modes.${value}`)}</strong>
              <span className={styles.fieldHint}>{t(`admin.payment.modeHints.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <TextField
        label={t("admin.payment.address")}
        hint={t("admin.payment.addressHint")}
        value={address}
        onChange={setAddress}
        error={errors.address}
        maxLength={200}
      />
      <TextField
        label={t("admin.payment.city")}
        value={city}
        onChange={setCity}
        error={errors.city}
        maxLength={50}
      />
      <TextField
        label={t("admin.payment.apiKey")}
        hint={keepsKeys ? t("admin.payment.keepKeys") : undefined}
        value={apiKey}
        onChange={setApiKey}
        maxLength={200}
      />
      <TextField
        label={t("admin.payment.secretKey")}
        type="password"
        value={secretKey}
        onChange={setSecretKey}
        error={errors.keys}
        maxLength={200}
      />

      {saveError && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
      {save.isSuccess && (
        <p className={styles.success} role="status">
          {t("admin.payment.saved")}
        </p>
      )}

      <div className={styles.sheetActions}>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? t("admin.payment.checking") : t("admin.payment.save")}
        </button>
        {saved.mode &&
          (confirmingRemove ? (
            <button
              type="button"
              className={`${styles.tool} ${styles.danger}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
            >
              {t("admin.payment.removeConfirm")}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.tool} ${styles.danger}`}
              onClick={() => setConfirmingRemove(true)}
            >
              {t("admin.payment.remove")}
            </button>
          ))}
      </div>
    </form>
  );
}
