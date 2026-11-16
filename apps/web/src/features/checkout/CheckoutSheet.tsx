import {
  formatKurus,
  guestContactSchema,
  mockPaymentSchema,
  type CheckoutRequestInput,
  type PaymentMethod,
  type PlacedOrder,
} from "@siparis/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import { ApiRequestError } from "../../lib/api";
import { leaveTo } from "../../lib/navigate";
import { readStorage, writeStorage } from "../../lib/storage";
import type { PricedCart } from "../cart/cart";
import { useCart } from "../cart/cart-context";
import { formatCardNumber, formatCvc, formatExpiry } from "./card-format";
import styles from "./Checkout.module.css";
import { useCheckout } from "./useCheckout";

type CardField = "cardHolder" | "cardNumber" | "expiry" | "cvc";
type Card = Record<CardField, string>;
type GuestField = "name" | "surname" | "email" | "phone";
type Guest = Record<GuestField, string>;

const emptyCard: Card = { cardHolder: "", cardNumber: "", expiry: "", cvc: "" };
const emptyGuest: Guest = { name: "", surname: "", email: "", phone: "" };

/** The guest's contact details stay on their own device, so the next order is quicker. */
const GUEST_STORAGE_KEY = "siparis.guest";

function storedGuest(): Guest {
  try {
    const parsed: unknown = JSON.parse(readStorage(GUEST_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return emptyGuest;
    const value = (field: GuestField) => {
      const v = (parsed as Record<string, unknown>)[field];
      return typeof v === "string" ? v.slice(0, 100) : "";
    };
    return {
      name: value("name"),
      surname: value("surname"),
      email: value("email"),
      phone: value("phone"),
    };
  } catch {
    return emptyGuest;
  }
}

const invalidCard = (card: Card) =>
  (Object.keys(card) as CardField[]).filter(
    (field) => !mockPaymentSchema.shape[field].safeParse(card[field]).success,
  );
const invalidGuest = (guest: Guest) =>
  (Object.keys(guest) as GuestField[]).filter(
    (field) => !guestContactSchema.shape[field].safeParse(guest[field]).success,
  );

type CheckoutSheetProps = {
  qrToken: string;
  priced: PricedCart;
  /** How this café's guests pay (from the menu). */
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: (order: PlacedOrder) => void;
  /** The server says the cart no longer matches the menu. */
  onCartChanged: () => void;
};

export function CheckoutSheet({
  qrToken,
  priced,
  paymentMethod,
  onBack,
  onSuccess,
  onCartChanged,
}: CheckoutSheetProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { cart } = useCart();
  const checkout = useCheckout(qrToken);
  const formId = useId();
  const [card, setCard] = useState(emptyCard);
  const [guest, setGuest] = useState(storedGuest);
  const [submitted, setSubmitted] = useState(false);
  // Stays true while the browser leaves for iyzico's page.
  const [redirecting, setRedirecting] = useState(false);

  const invalidNow = (): (CardField | GuestField)[] =>
    paymentMethod === "iyzico" ? invalidGuest(guest) : invalidCard(card);
  const invalid = submitted ? invalidNow() : [];
  const busy = checkout.isPending || redirecting;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (paymentMethod === "none" || invalidNow().length > 0 || busy) return;

    let payment: CheckoutRequestInput["payment"];
    if (paymentMethod === "iyzico") {
      writeStorage(GUEST_STORAGE_KEY, JSON.stringify(guest));
      payment = {
        method: "iyzico",
        buyer: guest,
        locale: i18n.language === "en" ? "en" : "tr",
      };
    } else {
      payment = { method: "mock", ...card };
    }

    checkout.mutate(
      {
        lines: priced.lines.map(({ line }) => ({
          productId: line.productId,
          quantity: line.quantity,
          optionIds: line.optionIds,
          note: line.note,
        })),
        note: cart.note,
        payment,
      },
      {
        onSuccess: (result) => {
          // iyzico payments continue on iyzico's page and come back to the menu.
          if (result.kind === "redirect") {
            setRedirecting(true);
            leaveTo(result.paymentPageUrl);
          } else onSuccess(result);
        },
        onError: (error) => {
          if (!(error instanceof ApiRequestError)) return;
          if (error.code === "INVALID_CART") onCartChanged();
          // The café's payment method changed since the menu loaded: reload it.
          if (error.code === "PAYMENTS_NOT_SET_UP" || error.details?.reason === "PAYMENT_METHOD") {
            void queryClient.invalidateQueries({ queryKey: ["menu", qrToken] });
          }
        },
      },
    );
  };

  const field = (
    name: CardField | GuestField,
    label: string,
    value: string,
    onChange: (value: string) => void,
    input: Record<string, string | number> = {},
  ): ReactNode => {
    const isInvalid = invalid.includes(name);
    return (
      <div className={styles.field}>
        <label htmlFor={`${formId}-${name}`}>{label}</label>
        <input
          id={`${formId}-${name}`}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? `${formId}-${name}-error` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...input}
        />
        {isInvalid && (
          <p id={`${formId}-${name}-error`} className={styles.fieldError}>
            {t(`checkout.invalid.${name}`)}
          </p>
        )}
      </div>
    );
  };
  const setCardField = (name: CardField) => (value: string) =>
    setCard((c) => ({ ...c, [name]: value }));
  const setGuestField = (name: GuestField) => (value: string) =>
    setGuest((g) => ({ ...g, [name]: value }));

  return (
    <Sheet
      title={t("checkout.title")}
      onClose={onBack}
      footer={
        paymentMethod !== "none" && (
          <button type="submit" form={formId} className="btn btn-primary btn-block" disabled={busy}>
            {redirecting
              ? t("checkout.redirecting")
              : checkout.isPending
                ? t("checkout.paying")
                : t("checkout.pay", { price: formatKurus(priced.totalKurus) })}
          </button>
        )
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

      {paymentMethod === "none" && (
        <p className={styles.notice} role="status">
          {t("checkout.notAvailable")}
        </p>
      )}

      {paymentMethod === "iyzico" && (
        <form id={formId} className={styles.form} onSubmit={submit} noValidate>
          <h3 className={styles.formTitle}>{t("checkout.contactTitle")}</h3>
          <div className={styles.row}>
            {field("name", t("checkout.name"), guest.name, setGuestField("name"), {
              autoComplete: "given-name",
              maxLength: 50,
            })}
            {field("surname", t("checkout.surname"), guest.surname, setGuestField("surname"), {
              autoComplete: "family-name",
              maxLength: 50,
            })}
          </div>
          {field("email", t("checkout.email"), guest.email, setGuestField("email"), {
            type: "email",
            autoComplete: "email",
            inputMode: "email",
            maxLength: 254,
          })}
          {field("phone", t("checkout.phone"), guest.phone, setGuestField("phone"), {
            type: "tel",
            autoComplete: "tel",
            inputMode: "tel",
            placeholder: "0555 123 45 67",
            maxLength: 20,
          })}
        </form>
      )}

      {paymentMethod === "mock" && (
        <form id={formId} className={styles.form} onSubmit={submit} noValidate>
          {field(
            "cardHolder",
            t("checkout.cardHolder"),
            card.cardHolder,
            setCardField("cardHolder"),
            {
              autoComplete: "cc-name",
              maxLength: 100,
            },
          )}
          {field(
            "cardNumber",
            t("checkout.cardNumber"),
            card.cardNumber,
            (v) => setCardField("cardNumber")(formatCardNumber(v)),
            { inputMode: "numeric", autoComplete: "cc-number", placeholder: "0000 0000 0000 0000" },
          )}
          <div className={styles.row}>
            {field(
              "expiry",
              t("checkout.expiry"),
              card.expiry,
              (v) => setCardField("expiry")(formatExpiry(v, card.expiry)),
              { inputMode: "numeric", autoComplete: "cc-exp", placeholder: "AA/YY" },
            )}
            {field("cvc", t("checkout.cvc"), card.cvc, (v) => setCardField("cvc")(formatCvc(v)), {
              inputMode: "numeric",
              autoComplete: "cc-csc",
              placeholder: "123",
            })}
          </div>
        </form>
      )}

      {paymentMethod === "iyzico" && <p className={styles.notice}>{t("checkout.iyzicoNotice")}</p>}
      {paymentMethod === "mock" && <p className={styles.notice}>{t("checkout.demoNotice")}</p>}
      <button type="button" className={styles.back} onClick={onBack}>
        ← {t("checkout.back")}
      </button>
    </Sheet>
  );
}

function CheckoutError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const code = error instanceof ApiRequestError ? error.code : "UNKNOWN";
  const reason = error instanceof ApiRequestError ? error.details?.reason : undefined;
  const messages: Partial<Record<string, string>> = {
    PAYMENT_FAILED: t("checkout.errors.paymentFailed"),
    RATE_LIMITED: t("checkout.errors.rateLimited"),
    CAFE_INACTIVE: t("checkout.errors.cafeInactive"),
    NETWORK_ERROR: t("checkout.errors.network"),
    INVALID_CART: t("cart.changed"),
    PAYMENT_PROVIDER_UNAVAILABLE: t("checkout.errors.providerUnavailable"),
    PAYMENTS_NOT_SET_UP: t("checkout.errors.methodChanged"),
  };
  const message =
    reason === "PAYMENT_METHOD"
      ? t("checkout.errors.methodChanged")
      : (messages[code] ?? t("checkout.errors.generic"));
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
