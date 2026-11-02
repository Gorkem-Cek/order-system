import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@siparis/shared";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiRequestError } from "../../lib/api";
import styles from "./ProductEditor.module.css";
import type { MenuActions } from "./useStaffMenu";

type ProductImageFieldProps = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  uploadImage: MenuActions["uploadImage"];
  removeImage: MenuActions["removeImage"];
};

/** Photo of an existing product: upload, replace or remove. Saved immediately. */
export function ProductImageField({
  productId,
  productName,
  imageUrl: initialUrl,
  uploadImage,
  removeImage,
}: ProductImageFieldProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const busy = uploadImage.isPending || removeImage.isPending;

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("productEditor.image.tooLarge"));
      return;
    }
    uploadImage.mutate(
      { id: productId, file },
      {
        onSuccess: (product) => setImageUrl(product.imageUrl),
        onError: (e) =>
          setError(
            e instanceof ApiRequestError && e.code === "UNSUPPORTED_IMAGE"
              ? t("productEditor.image.unsupported")
              : e instanceof ApiRequestError && e.code === "FILE_TOO_LARGE"
                ? t("productEditor.image.tooLarge")
                : t("menuAdmin.errors.generic"),
          ),
      },
    );
  };

  return (
    <div className={styles.imageField}>
      <span className={styles.imageLabel}>{t("productEditor.image.label")}</span>
      <div className={styles.imageRow}>
        {imageUrl ? (
          <img className={styles.imagePreview} src={imageUrl} alt={productName} />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true">
            📷
          </div>
        )}
        <div className={styles.imageActions}>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="visually-hidden"
            id={`image-${productId}`}
            onChange={(e) => pick(e.target.files?.[0])}
            disabled={busy}
          />
          <label htmlFor={`image-${productId}`} className="btn btn-secondary" aria-disabled={busy}>
            {uploadImage.isPending
              ? t("productEditor.image.uploading")
              : imageUrl
                ? t("productEditor.image.replace")
                : t("productEditor.image.upload")}
          </label>
          {imageUrl && (
            <button
              type="button"
              className={`${styles.link} ${styles.danger}`}
              disabled={busy}
              onClick={() =>
                removeImage.mutate(productId, {
                  onSuccess: () => setImageUrl(null),
                  onError: () => setError(t("menuAdmin.errors.generic")),
                })
              }
            >
              {t("productEditor.image.remove")}
            </button>
          )}
          <span className={styles.hint}>{t("productEditor.image.hint")}</span>
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
