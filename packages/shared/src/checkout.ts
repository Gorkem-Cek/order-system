import { z } from "zod";
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

/**
 * Mock card payment for the MVP. A real provider (e.g. iyzico) will be added as another
 * `method`, using the provider's own hosted form so card data never reaches our server.
 */
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

export const paymentSchema = z.discriminatedUnion("method", [mockPaymentSchema]);

export const checkoutRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(MAX_CART_LINES),
  note: noteSchema(ORDER_NOTE_MAX_LENGTH),
  payment: paymentSchema,
});

export const checkoutResponseSchema = z.object({
  orderId: idSchema,
  orderNumber: z.int().positive(),
  totalKurus: kurusSchema,
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type CartLineInput = z.input<typeof cartLineSchema>;
export type MockPayment = z.infer<typeof mockPaymentSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutRequestInput = z.input<typeof checkoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
