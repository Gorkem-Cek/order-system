import { formatKurus, ORDER_NOTE_MAX_LENGTH } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import { QuantityStepper } from "../../components/QuantityStepper";
import { Sheet } from "../../components/Sheet";
import type { CartLine, PricedCart } from "./cart";
import { useCart } from "./cart-context";
import styles from "./Cart.module.css";

type CartSheetProps = {
  priced: PricedCart;
  onEdit: (line: CartLine) => void;
  onCheckout: () => void;
  onClose: () => void;
  /** Shown above the lines, e.g. when checkout found the cart out of date. */
  notice?: string;
};

export function CartSheet({ priced, onEdit, onCheckout, onClose, notice }: CartSheetProps) {
  const { t } = useTranslation();
  const { cart, dispatch } = useCart();
  const canCheckout = priced.lines.length > 0 && !priced.hasInvalidLines;

  return (
    <Sheet
      title={t("cart.title")}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <div className={styles.total}>
            <span>{t("cart.total")}</span>
            <strong>{formatKurus(priced.totalKurus)}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={onCheckout}
            disabled={!canCheckout}
          >
            {t("cart.checkout")}
          </button>
          {priced.hasInvalidLines && <p className={styles.hint}>{t("cart.fixInvalid")}</p>}
        </div>
      }
    >
      {notice && (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}
      {priced.lines.length === 0 ? (
        <p className={styles.empty}>{t("cart.empty")}</p>
      ) : (
        <ul className={styles.lines}>
          {priced.lines.map((item) => {
            const { line } = item;
            const name = item.product?.name ?? "—";
            return (
              <li key={line.key} className={styles.line} data-invalid={!item.ok || undefined}>
                <div className={styles.lineTop}>
                  <span className={styles.lineName}>
                    {line.quantity} × {name}
                  </span>
                  {item.ok && (
                    <span className={styles.linePrice}>{formatKurus(item.totalKurus)}</span>
                  )}
                </div>
                {item.ok && item.selectedOptions.length > 0 && (
                  <p className={styles.lineOptions}>
                    {item.selectedOptions.map((o) => o.option).join(", ")}
                  </p>
                )}
                {line.note && <p className={styles.lineNote}>“{line.note}”</p>}
                {!item.ok && (
                  <p className={styles.lineError} role="alert">
                    {t("cart.lineInvalid")}
                  </p>
                )}
                <div className={styles.lineActions}>
                  {item.ok && (
                    <QuantityStepper
                      value={line.quantity}
                      onChange={(quantity) =>
                        dispatch({ type: "setQuantity", key: line.key, quantity })
                      }
                      label={name}
                    />
                  )}
                  <span className={styles.spacer} />
                  {item.product?.isAvailable && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => onEdit(line)}
                    >
                      {t("cart.edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => dispatch({ type: "remove", key: line.key })}
                    aria-label={`${t("cart.remove")}: ${name}`}
                  >
                    {t("cart.remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {priced.lines.length > 0 && (
        <label className={styles.noteLabel}>
          {t("cart.orderNote")}
          <textarea
            className={styles.note}
            value={cart.note}
            onChange={(event) => dispatch({ type: "setNote", note: event.target.value })}
            placeholder={t("cart.orderNotePlaceholder")}
            maxLength={ORDER_NOTE_MAX_LENGTH}
            rows={2}
          />
        </label>
      )}
    </Sheet>
  );
}
