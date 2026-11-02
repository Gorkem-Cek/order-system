import { useTranslation } from "react-i18next";
import { Sheet } from "./Sheet";
import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  title: string;
  text?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

/** A yes/no question for destructive actions. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={title}
      onClose={onCancel}
      footer={
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={`btn ${styles.danger}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {text && <p>{text}</p>}
    </Sheet>
  );
}
