import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImageField } from "../../components/ImageField";
import { brandStyle } from "../../lib/color";
import { useStaff } from "../staff/staff-context";
import { PasswordForm } from "./PasswordForm";
import styles from "./SettingsPage.module.css";
import { useCafeSettingsActions, type CafeSettingsActions } from "./useCafeSettings";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Colours that read well with white text on buttons. */
const PRESET_COLORS = [
  "#7c4a2d",
  "#b45309",
  "#be123c",
  "#7c3aed",
  "#1d4ed8",
  "#0f766e",
  "#15803d",
  "#1f2937",
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { cafe, user } = useStaff();
  const actions = useCafeSettingsActions();

  return (
    <main className={styles.page}>
      <title>{`${t("settings.title")} · ${t("common.appName")}`}</title>
      <h1 className={styles.title}>{t("settings.title")}</h1>

      <section className={styles.card} aria-labelledby="branding-title">
        <h2 id="branding-title" className={styles.cardTitle}>
          {t("settings.branding")}
        </h2>
        <p className={styles.hint}>{t("settings.brandingHint")}</p>
        {/* Re-mount when another screen changes the café, so the form shows fresh values. */}
        <BrandingForm key={`${cafe.name}|${cafe.primaryColor}`} update={actions.update} />
        <div className={styles.images}>
          <ImageField
            id="cafe-logo"
            label={t("settings.logo")}
            alt={t("settings.logo")}
            imageUrl={cafe.logoUrl}
            onUpload={async (file) =>
              (await actions.uploadImage.mutateAsync({ kind: "logo", file })).logoUrl
            }
            onRemove={() => actions.removeImage.mutateAsync("logo")}
          />
          <ImageField
            id="cafe-cover"
            label={t("settings.cover")}
            alt={t("settings.cover")}
            imageUrl={cafe.coverUrl}
            shape="wide"
            onUpload={async (file) =>
              (await actions.uploadImage.mutateAsync({ kind: "cover", file })).coverUrl
            }
            onRemove={() => actions.removeImage.mutateAsync("cover")}
          />
        </div>
        <p className={styles.hint}>{t("settings.imagesHint")}</p>
      </section>

      <section className={styles.card} aria-labelledby="password-title">
        <h2 id="password-title" className={styles.cardTitle}>
          {t("password.title")}
        </h2>
        <p className={styles.hint}>
          {user.role === "SUPER_ADMIN" ? t("password.adminHint") : t("password.hint")}
        </p>
        <PasswordForm />
      </section>
    </main>
  );
}

function BrandingForm({ update }: { update: CafeSettingsActions["update"] }) {
  const { t } = useTranslation();
  const { cafe } = useStaff();
  const [name, setName] = useState(cafe.name);
  const [color, setColor] = useState(cafe.primaryColor);
  const [touched, setTouched] = useState(false);

  const nameError = name.trim().length < 2 ? t("settings.errors.name") : null;
  const colorError = HEX_COLOR.test(color) ? null : t("settings.errors.color");
  const changed = name.trim() !== cafe.name || color.toLowerCase() !== cafe.primaryColor;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (nameError || colorError || !changed) return;
    update.mutate({ name: name.trim(), primaryColor: color });
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span>{t("settings.name")}</span>
        <input
          value={name}
          onChange={(e) => {
            update.reset();
            setName(e.target.value);
          }}
          maxLength={100}
          aria-invalid={touched && nameError ? true : undefined}
        />
        {touched && nameError && <span className={styles.error}>{nameError}</span>}
      </label>

      <fieldset className={styles.colorField}>
        <legend>{t("settings.color")}</legend>
        <div className={styles.colorRow}>
          <input
            type="color"
            value={HEX_COLOR.test(color) ? color : cafe.primaryColor}
            onChange={(e) => {
              update.reset();
              setColor(e.target.value);
            }}
            aria-label={t("settings.color")}
          />
          <input
            className={styles.hex}
            value={color}
            onChange={(e) => {
              update.reset();
              setColor(e.target.value.trim());
            }}
            maxLength={7}
            aria-label={t("settings.colorHex")}
            aria-invalid={touched && colorError ? true : undefined}
          />
          <div className={styles.presets} role="group" aria-label={t("settings.presets")}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.swatch}
                style={{ background: preset }}
                aria-label={t("settings.preset", { color: preset })}
                aria-pressed={color.toLowerCase() === preset}
                onClick={() => {
                  update.reset();
                  setColor(preset);
                }}
              />
            ))}
          </div>
        </div>
        {touched && colorError && <span className={styles.error}>{colorError}</span>}
      </fieldset>

      <div className={styles.preview} style={brandStyle(color)} aria-label={t("settings.preview")}>
        <span className={styles.previewName}>{name.trim() || cafe.name}</span>
        <span className="btn btn-primary" aria-hidden="true">
          {t("settings.previewButton")}
        </span>
      </div>

      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={!changed || update.isPending}>
          {update.isPending ? t("settings.saving") : t("settings.save")}
        </button>
        {update.isSuccess && (
          <span className={styles.success} role="status">
            {t("settings.saved")}
          </span>
        )}
        {update.isError && (
          <span className={styles.error} role="alert">
            {t("settings.errors.generic")}
          </span>
        )}
      </div>
    </form>
  );
}
