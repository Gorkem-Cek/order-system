import { z } from "zod";
import { emailSchema } from "./auth";
import { idSchema, kurusSchema, noteSchema } from "./common";

// POST /api/menu/:qrToken/checkout — pay, then create the order (pay-before-send).
// The request carries no prices: the server prices every line from the database.

export const MAX_ITEM_QUANTITY = 50;
export const MAX_CART_LINES = 50;
export const ITEM_NOTE_MAX_LENGTH = 200;
export const ORDER_NOTE_MAX_LENGTH = 500;

export const cartLineSchema = z.object({
  productId: idSchema,
  quantity: z.int().min(1).max(MAX_ITEM_QUANTITY),
  optionIds: z.array(idSchema).max(30).default([]),
  note: noteSchema(ITEM_NOTE_MAX_LENGTH),
});

/** Fake card payment for development and tests; refused when real payments are required. */
export const mockPaymentSchema = z.object({
  method: z.literal("mock"),
  cardHolder: z.string().trim().min(2).max(100),
  // Spaces are allowed while typing; stored without them.
  cardNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{12,19}$/)),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/),
  cvc: z.string().regex(/^\d{3,4}$/),
});

/**
 * A mobile number in iyzico's format: Turkish numbers in any common spelling become
 * +905XXXXXXXXX; international numbers must start with +.
 */
export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .transform((value) => {
    if (/^\+\d{8,15}$/.test(value)) return value;
    const turkish = value.match(/^(?:0090|90|0)?(5\d{9})$/);
    return turkish ? `+90${turkish[1]}` : value;
  })
  .pipe(z.string().regex(/^\+\d{8,15}$/, "Enter a mobile number"));

/** What a guest tells iyzico about themselves. Passed to iyzico and never stored by us. */
export const guestContactSchema = z.object({
  name: z.string().trim().min(2).max(50),
  surname: z.string().trim().min(2).max(50),
  email: emailSchema,
  phone: phoneSchema,
});

/** iyzico: the guest is sent to iyzico's own payment page; card data never reaches us. */
export const iyzicoPaymentSchema = z.object({
  method: z.literal("iyzico"),
  buyer: guestContactSchema,
  /** Language of iyzico's payment page. */
  locale: z.enum(["tr", "en"]).default("tr"),
});

export const paymentSchema = z.discriminatedUnion("method", [
  mockPaymentSchema,
  iyzicoPaymentSchema,
]);

/** How guests of a café pay: "none" until its iyzico account is connected. */
export const PAYMENT_METHODS = ["iyzico", "mock", "none"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const checkoutRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(MAX_CART_LINES),
  note: noteSchema(ORDER_NOTE_MAX_LENGTH),
  payment: paymentSchema,
});

export const placedOrderSchema = z.object({
  orderId: idSchema,
  orderNumber: z.int().positive(),
  totalKurus: kurusSchema,
});

// "paid": the order exists (mock payments, or a free order).
// "redirect": send the guest to iyzico's payment page; the order is created after iyzico
// confirms the payment, and the guest comes back to /m/<qrToken>?payment=<paymentId>.
export const checkoutResponseSchema = z.discriminatedUnion("kind", [
  placedOrderSchema.extend({ kind: z.literal("paid") }),
  z.object({ kind: z.literal("redirect"), paymentId: idSchema, paymentPageUrl: z.url() }),
]);

// GET /api/menu/:qrToken/payments/:paymentId — how a payment on iyzico's page ended.
export const PAYMENT_ATTEMPT_STATUSES = ["PENDING", "PAID", "FAILED"] as const;
export const paymentStatusResponseSchema = z.object({
  status: z.enum(PAYMENT_ATTEMPT_STATUSES),
  order: placedOrderSchema.nullable(),
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type CartLineInput = z.input<typeof cartLineSchema>;
export type MockPayment = z.infer<typeof mockPaymentSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type IyzicoPayment = z.infer<typeof iyzicoPaymentSchema>;
export type GuestContact = z.infer<typeof guestContactSchema>;
export type GuestContactInput = z.input<typeof guestContactSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PlacedOrder = z.infer<typeof placedOrderSchema>;
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutRequestInput = z.input<typeof checkoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
