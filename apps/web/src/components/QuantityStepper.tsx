import { MAX_ITEM_QUANTITY } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import styles from "./QuantityStepper.module.css";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** Accessible name of the item, e.g. the product name. */
  label: string;
  /** Lowest allowed value (1 for the product sheet; the cart removes lines separately). */
  min?: number;
};

export function QuantityStepper({ value, onChange, label, min = 1 }: QuantityStepperProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.stepper} role="group" aria-label={`${t("product.quantity")}: ${label}`}>
      <button
        type="button"
        className="btn-icon"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={t("product.decrease")}
      >
        −
      </button>
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="btn-icon"
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_ITEM_QUANTITY}
        aria-label={t("product.increase")}
      >
        +
      </button>
    </div>
  );
}
