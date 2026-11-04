import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@siparis/shared";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiRequestError } from "../lib/api";
import styles from "./ImageField.module.css";

type ImageFieldProps = {
  /** Unique per page; links the hidden file input to its button. */
  id: string;
  label: string;
  /** Alt text of the preview. */
  alt: string;
  imageUrl: string | null;
  /** "wide" previews a cover photo; "square" a logo or product photo. */
  shape?: "square" | "wide";
  /** Uploads the file and resolves with the stored image's URL. */
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => Promise<unknown>;
};

/** Upload, replace or remove one image. Each change is saved immediately. */
export function ImageField({
  id,
  label,
  alt,
  imageUrl: initialUrl,
  shape = "square",
  onUpload,
  onRemove,
}: ImageFieldProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialUrl);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "upload" | "remove", action: () => Promise<void>) => {
    setError(null);
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof ApiRequestError && e.code === "UNSUPPORTED_IMAGE"
          ? t("imageField.unsupported")
          : e instanceof ApiRequestError && e.code === "FILE_TOO_LARGE"
            ? t("imageField.tooLarge")
            : t("imageField.failed"),
      );
    } finally {
      setBusy(null);
    }
  };

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("imageField.tooLarge"));
      return;
    }
    void run("upload", async () => setImageUrl(await onUpload(file)));
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row} data-shape={shape}>
        {imageUrl ? (
          <img className={styles.preview} src={imageUrl} alt={alt} />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            📷
          </div>
        )}
        <div className={styles.actions}>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="visually-hidden"
            id={id}
            onChange={(e) => pick(e.target.files?.[0])}
            disabled={busy !== null}
          />
          <label htmlFor={id} className="btn btn-secondary" aria-disabled={busy !== null}>
            {busy === "upload"
              ? t("imageField.uploading")
              : imageUrl
                ? t("imageField.replace")
                : t("imageField.upload")}
          </label>
          {imageUrl && (
            <button
              type="button"
              className={styles.remove}
              disabled={busy !== null}
              onClick={() =>
                void run("remove", async () => {
                  await onRemove();
                  setImageUrl(null);
                })
              }
            >
              {t("imageField.remove")}
            </button>
          )}
          <span className={styles.hint}>{t("imageField.hint")}</span>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
