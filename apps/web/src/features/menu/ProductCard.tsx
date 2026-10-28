import { formatKurus, type MenuProduct } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import styles from "./MenuPage.module.css";

export function ProductCard({ product, onOpen }: { product: MenuProduct; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        type="button"
        className={styles.card}
        onClick={onOpen}
        disabled={!product.isAvailable}
        aria-label={`${product.name}, ${formatKurus(product.priceKurus)}${
          product.isAvailable ? "" : `, ${t("menu.unavailable")}`
        }`}
      >
        <span className={styles.cardText}>
          <span className={styles.cardName}>{product.name}</span>
          {product.description && (
            <span className={styles.cardDescription}>{product.description}</span>
          )}
          <span className={styles.cardMeta}>
            <span className={styles.price}>{formatKurus(product.priceKurus)}</span>
            {!product.isAvailable ? (
              <span className={styles.badgeMuted}>{t("menu.unavailable")}</span>
            ) : (
              product.optionGroups.length > 0 && (
                <span className={styles.badge}>{t("menu.hasOptions")}</span>
              )
            )}
          </span>
        </span>
        {product.imageUrl && (
          <img className={styles.cardImage} src={product.imageUrl} alt="" loading="lazy" />
        )}
      </button>
    </li>
  );
}
