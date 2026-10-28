import { formatKurus } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import type { PricedCart } from "./cart";
import styles from "./Cart.module.css";

/** Sticky bar at the bottom of the menu that opens the cart. */
export function CartBar({ priced, onOpen }: { priced: PricedCart; onOpen: () => void }) {
  const { t } = useTranslation();
  if (priced.lines.length === 0) return null;
  return (
    <div className={styles.bar}>
      <button type="button" className={`btn btn-primary ${styles.barButton}`} onClick={onOpen}>
        <span className={styles.barCount}>{t("cart.items", { count: priced.itemCount })}</span>
        <span>{t("cart.view")}</span>
        <span className={styles.barTotal}>{formatKurus(priced.totalKurus)}</span>
      </button>
    </div>
  );
}
