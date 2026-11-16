import type { PlacedOrder } from "@siparis/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusScreen } from "../../components/StatusScreen";
import { ApiRequestError } from "../../lib/api";
import { SLOW_AFTER_MS, usePaymentStatus } from "./usePaymentStatus";

/**
 * Shown when the guest comes back from iyzico's page (/m/<qrToken>?payment=<id>): waits for the
 * server to confirm the payment, then hands over the placed order or lets the guest retry.
 */
export function PaymentReturn({
  qrToken,
  paymentId,
  onPaid,
  onRetry,
  onDismiss,
}: {
  qrToken: string;
  paymentId: string;
  onPaid: (order: PlacedOrder) => void;
  /** Payment failed: back to the menu with the cart open. */
  onRetry: () => void;
  /** Back to the plain menu (e.g. an unknown payment link). */
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [startedAt] = useState(() => Date.now());
  const status = usePaymentStatus(qrToken, paymentId, startedAt);
  const slow = useElapsed(startedAt, SLOW_AFTER_MS);

  const order = status.data?.status === "PAID" ? status.data.order : null;
  const unknown =
    status.error instanceof ApiRequestError && [400, 404].includes(status.error.status);

  useEffect(() => {
    if (order) onPaid(order);
    else if (unknown) onDismiss();
  }, [order, unknown, onPaid, onDismiss]);

  if (status.data?.status === "FAILED" || (status.data?.status === "PAID" && !order)) {
    return (
      <StatusScreen
        icon="✕"
        title={t("paymentReturn.failedTitle")}
        text={t("paymentReturn.failedText")}
        action={
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {t("paymentReturn.retry")}
          </button>
        }
      />
    );
  }

  return (
    <StatusScreen
      icon="⏳"
      title={t("paymentReturn.checkingTitle")}
      text={slow ? t("paymentReturn.slowText") : t("paymentReturn.checkingText")}
      action={
        slow && (
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            {t("paymentReturn.backToMenu")}
          </button>
        )
      }
    />
  );
}

/** True once `ms` have passed since `since`. */
function useElapsed(since: number, ms: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), Math.max(0, since + ms - Date.now()));
    return () => clearTimeout(timer);
  }, [since, ms]);
  return elapsed;
}
