import { formatKurus, mockPaymentSchema, type CheckoutResponse } from "@siparis/shared";
import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import { ApiRequestError } from "../../lib/api";
import type { PricedCart } from "../cart/cart";
import { useCart } from "../cart/cart-context";
import { formatCardNumber, formatCvc, formatExpiry } from "./card-format";
import styles from "./Checkout.module.css";
import { useCheckout } from "./useCheckout";

type CardField = "cardHolder" | "cardNumber" | "expiry" | "cvc";
type Card = Record<CardField, string>;

const emptyCard: Card = { cardHolder: "", cardNumber: "", expiry: "", cvc: "" };

function invalidFields(card: Card): CardField[] {
  return (Object.keys(card) as CardField[]).filter(
    (field) => !mockPaymentSchema.shape[field].safeParse(card[field]).success,
  );
}

type CheckoutSheetProps = {
  qrToken: string;
  priced: PricedCart;
  onBack: () => void;
  onSuccess: (order: CheckoutResponse) => void;
  /** The server says the cart no longer matches the menu. */
  onCartChanged: () => void;
};

export function CheckoutSheet({
  qrToken,
  priced,
  onBack,
  onSuccess,
  onCartChanged,
}: CheckoutSheetProps) {
  const { t } = useTranslation();
  const { cart } = useCart();
  const checkout = useCheckout(qrToken);
  const formId = useId();
  const [card, setCard] = useState(emptyCard);
  const [submitted, setSubmitted] = useState(false);

  const invalid = submitted ? invalidFields(card) : [];
  const set = (field: CardField, value: string) => setCard((c) => ({ ...c, [field]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (invalidFields(card).length > 0 || checkout.isPending) return;

    checkout.mutate(
      {
        lines: priced.lines.map(({ line }) => ({
          productId: line.productId,
          quantity: line.quantity,
          optionIds: line.optionIds,
          note: line.note,
        })),
        note: cart.note,
        payment: { method: "mock", ...card },
      },
      {
        onSuccess,
        onError: (error) => {
          if (error instanceof ApiRequestError && error.code === "INVALID_CART") onCartChanged();
        },
      },
    );
  };

  const fieldProps = (field: CardField) => ({
    id: `${formId}-${field}`,
    "aria-invalid": invalid.includes(field) || undefined,
    "aria-describedby": invalid.includes(field) ? `${formId}-${field}-error` : undefined,
  });
  const fieldError = (field: CardField) =>
    invalid.includes(field) && (
      <p id={`${formId}-${field}-error`} className={styles.fieldError}>
        {t(`checkout.invalid.${field}`)}
      </p>
    );

  return (
    <Sheet
      title={t("checkout.title")}
      onClose={onBack}
      footer={
        <button
          type="submit"
          form={formId}
          className="btn btn-primary btn-block"
          disabled={checkout.isPending}
        >
          {checkout.isPending
            ? t("checkout.paying")
            : t("checkout.pay", { price: formatKurus(priced.totalKurus) })}
        </button>
      }
    >
      <section className={styles.summary} aria-label={t("checkout.summary")}>
        <ul className={styles.summaryLines}>
          {priced.lines.map(
            (item) =>
              item.ok && (
                <li key={item.line.key}>
                  <span>
                    {item.line.quantity} × {item.product.name}
                  </span>
                  <span>{formatKurus(item.totalKurus)}</span>
                </li>
              ),
          )}
        </ul>
        <div className={styles.summaryTotal}>
          <span>{t("checkout.total")}</span>
          <strong>{formatKurus(priced.totalKurus)}</strong>
        </div>
      </section>

      {checkout.isError && <CheckoutError error={checkout.error} />}

      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${formId}-cardHolder`}>{t("checkout.cardHolder")}</label>
          <input
            {...fieldProps("cardHolder")}
            value={card.cardHolder}
            onChange={(e) => set("cardHolder", e.target.value)}
            autoComplete="cc-name"
            maxLength={100}
          />
          {fieldError("cardHolder")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-cardNumber`}>{t("checkout.cardNumber")}</label>
          <input
            {...fieldProps("cardNumber")}
            value={card.cardNumber}
            onChange={(e) => set("cardNumber", formatCardNumber(e.target.value))}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
          />
          {fieldError("cardNumber")}
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={`${formId}-expiry`}>{t("checkout.expiry")}</label>
            <input
              {...fieldProps("expiry")}
              value={card.expiry}
              onChange={(e) => set("expiry", formatExpiry(e.target.value, card.expiry))}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="AA/YY"
            />
            {fieldError("expiry")}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${formId}-cvc`}>{t("checkout.cvc")}</label>
            <input
              {...fieldProps("cvc")}
              value={card.cvc}
              onChange={(e) => set("cvc", formatCvc(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
            />
            {fieldError("cvc")}
          </div>
        </div>
      </form>

      <p className={styles.demoNotice}>{t("checkout.demoNotice")}</p>
      <button type="button" className={styles.back} onClick={onBack}>
        ← {t("checkout.back")}
      </button>
    </Sheet>
  );
}

function CheckoutError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const code = error instanceof ApiRequestError ? error.code : "UNKNOWN";
  const message =
    code === "PAYMENT_FAILED"
      ? t("checkout.errors.paymentFailed")
      : code === "RATE_LIMITED"
        ? t("checkout.errors.rateLimited")
        : code === "CAFE_INACTIVE"
          ? t("checkout.errors.cafeInactive")
          : code === "NETWORK_ERROR"
            ? t("checkout.errors.network")
            : code === "INVALID_CART"
              ? t("cart.changed")
              : t("checkout.errors.generic");
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
