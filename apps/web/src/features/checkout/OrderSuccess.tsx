import { formatKurus, type CheckoutResponse } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import styles from "./Checkout.module.css";

export function OrderSuccess({
  order,
  tableName,
  onBack,
}: {
  order: CheckoutResponse;
  tableName: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <main className={styles.success} aria-live="polite">
      <div className={styles.check} aria-hidden="true">
        ✓
      </div>
      <h1 className={styles.successTitle}>{t("success.title")}</h1>
      <p className={styles.successText}>{t("success.text", { table: tableName })}</p>
      <div className={styles.receipt}>
        <div>
          <span>{t("success.orderNumber")}</span>
          <strong className={styles.orderNumber}>#{order.orderNumber}</strong>
        </div>
        <div>
          <span>{t("success.paid")}</span>
          <strong>{formatKurus(order.totalKurus)}</strong>
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={onBack}>
        {t("success.backToMenu")}
      </button>
    </main>
  );
}
