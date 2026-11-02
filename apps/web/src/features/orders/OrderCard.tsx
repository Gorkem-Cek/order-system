import { formatKurus, type Order } from "@siparis/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import { ApiRequestError } from "../../lib/api";
import styles from "./OrdersBoard.module.css";
import { useUpdateOrderStatus } from "./useOrders";

type OrderCardProps = {
  order: Order;
  now: number;
  fresh: boolean;
  onHandled: () => void;
  onConflict: () => void;
};

export function OrderCard({ order, now, fresh, onHandled, onConflict }: OrderCardProps) {
  const { t, i18n } = useTranslation();
  const update = useUpdateOrderStatus();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const created = new Date(order.createdAt);
  const minutes = Math.floor((now - created.getTime()) / 60_000);
  const time = created.toLocaleTimeString(i18n.language === "en" ? "en-GB" : "tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const next = order.status === "NEW" ? "PREPARING" : "SERVED";

  const move = (status: "PREPARING" | "SERVED" | "CANCELLED") => {
    onHandled();
    update.mutate(
      { orderId: order.id, status },
      {
        onSuccess: () => setConfirmingCancel(false),
        onError: (error) => {
          setConfirmingCancel(false);
          if (error instanceof ApiRequestError && error.code === "INVALID_STATUS_TRANSITION") {
            onConflict();
          }
        },
      },
    );
  };

  const errorMessage =
    update.error instanceof ApiRequestError && update.error.code === "INVALID_STATUS_TRANSITION"
      ? t("board.errors.changed")
      : update.error && t("board.errors.generic");

  return (
    <article
      className={styles.card}
      data-fresh={fresh || undefined}
      aria-labelledby={`order-${order.id}`}
    >
      <header className={styles.cardHeader}>
        <h3 id={`order-${order.id}`} className={styles.orderNumber}>
          #{order.orderNumber}
        </h3>
        <span className={styles.table}>{order.tableName}</span>
        {fresh && <span className={styles.freshBadge}>{t("board.newBadge")}</span>}
        <span className={styles.time}>
          <time dateTime={order.createdAt}>{time}</time> ·{" "}
          {minutes < 1 ? t("board.justNow") : t("board.minutesAgo", { count: minutes })}
        </span>
      </header>

      <ul className={styles.items}>
        {order.items.map((item) => (
          <li key={item.id}>
            <span className={styles.itemName}>
              <span className={styles.quantity}>{item.quantity} ×</span> {item.productName}
            </span>
            {item.selectedOptions.length > 0 && (
              <span className={styles.itemOptions}>
                {item.selectedOptions.map((o) => o.option).join(", ")}
              </span>
            )}
            {item.note && <span className={styles.itemNote}>“{item.note}”</span>}
          </li>
        ))}
      </ul>

      {order.note && (
        <p className={styles.orderNote}>
          <strong>{t("board.orderNote")}:</strong> {order.note}
        </p>
      )}

      {errorMessage && (
        <p className={styles.cardError} role="alert">
          {errorMessage}
        </p>
      )}

      <footer className={styles.cardFooter}>
        <span className={styles.total}>{formatKurus(order.totalKurus)}</span>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => setConfirmingCancel(true)}
          disabled={update.isPending}
        >
          {t("board.actions.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => move(next)}
          disabled={update.isPending}
        >
          {t(`board.actions.${next}`)}
        </button>
      </footer>

      {confirmingCancel && (
        <Sheet
          title={t("board.cancelTitle", { number: order.orderNumber })}
          onClose={() => setConfirmingCancel(false)}
          footer={
            <div className={styles.confirmActions}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmingCancel(false)}
              >
                {t("board.cancelKeep")}
              </button>
              <button
                type="button"
                className={`btn ${styles.danger}`}
                onClick={() => move("CANCELLED")}
                disabled={update.isPending}
              >
                {t("board.cancelConfirm")}
              </button>
            </div>
          }
        >
          <p>{t("board.cancelText")}</p>
        </Sheet>
      )}
    </article>
  );
}
