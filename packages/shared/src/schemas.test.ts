import { describe, expect, it } from "vitest";
import {
  changePasswordRequestSchema,
  checkoutRequestSchema,
  loginRequestSchema,
  MAX_ITEM_QUANTITY,
  orderHistoryQuerySchema,
  updateOrderStatusRequestSchema,
  type CheckoutRequestInput,
} from "./index";

const productId = "ckv9z0y8x0000qwer1234abcd";
const optionId = "ckv9z0y8x0001qwer1234abcd";

const validCheckout: CheckoutRequestInput = {
  lines: [{ productId, quantity: 2, optionIds: [optionId], note: "  Şekersiz olsun  " }],
  note: "",
  payment: {
    method: "mock",
    cardHolder: "Ayşe Yılmaz",
    cardNumber: "4242 4242 4242 4242",
    expiry: "12/29",
    cvc: "123",
  },
};

describe("checkoutRequestSchema", () => {
  it("accepts a valid cart and normalises notes and card number", () => {
    const parsed = checkoutRequestSchema.parse(validCheckout);
    expect(parsed.lines[0]?.note).toBe("Şekersiz olsun");
    expect(parsed.note).toBeUndefined();
    expect(parsed.payment.cardNumber).toBe("4242424242424242");
  });

  it("defaults optionIds to an empty list", () => {
    const parsed = checkoutRequestSchema.parse({
      ...validCheckout,
      lines: [{ productId, quantity: 1 }],
    });
    expect(parsed.lines[0]?.optionIds).toEqual([]);
  });

  it("ignores any prices the client sends", () => {
    const parsed = checkoutRequestSchema.parse({ ...validCheckout, totalKurus: 1 });
    expect(parsed).not.toHaveProperty("totalKurus");
  });

  it.each([
    ["an empty cart", { lines: [] }],
    ["zero quantity", { lines: [{ productId, quantity: 0 }] }],
    ["a fractional quantity", { lines: [{ productId, quantity: 1.5 }] }],
    ["too large a quantity", { lines: [{ productId, quantity: MAX_ITEM_QUANTITY + 1 }] }],
    ["a malformed product id", { lines: [{ productId: "1; drop table", quantity: 1 }] }],
    [
      "an item note that is too long",
      { lines: [{ productId, quantity: 1, note: "x".repeat(201) }] },
    ],
  ])("rejects %s", (_, override) => {
    expect(checkoutRequestSchema.safeParse({ ...validCheckout, ...override }).success).toBe(false);
  });

  it.each([
    ["card number", { cardNumber: "4242" }],
    ["expiry month", { expiry: "13/29" }],
    ["expiry format", { expiry: "1229" }],
    ["cvc", { cvc: "12" }],
    ["payment method", { method: "cash" }],
  ])("rejects an invalid %s", (_, override) => {
    const payment = { ...validCheckout.payment, ...override };
    expect(checkoutRequestSchema.safeParse({ ...validCheckout, payment }).success).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("trims and lowercases the email", () => {
    expect(loginRequestSchema.parse({ email: "  Demo@Kafe.COM ", password: "x" }).email).toBe(
      "demo@kafe.com",
    );
  });

  it("rejects an invalid email or an empty password", () => {
    expect(loginRequestSchema.safeParse({ email: "demo", password: "x" }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: "demo@kafe.com", password: "" }).success).toBe(
      false,
    );
  });
});

describe("changePasswordRequestSchema", () => {
  it("requires a new password of at least 8 characters that differs from the current one", () => {
    const parse = (currentPassword: string, newPassword: string) =>
      changePasswordRequestSchema.safeParse({ currentPassword, newPassword }).success;
    expect(parse("eski-sifre", "yeni-sifre-123")).toBe(true);
    expect(parse("eski-sifre", "kisa")).toBe(false);
    expect(parse("ayni-sifre-1", "ayni-sifre-1")).toBe(false);
  });
});

describe("updateOrderStatusRequestSchema", () => {
  it("only accepts statuses an order can be moved to", () => {
    expect(updateOrderStatusRequestSchema.safeParse({ status: "PREPARING" }).success).toBe(true);
    expect(updateOrderStatusRequestSchema.safeParse({ status: "NEW" }).success).toBe(false);
  });
});

describe("orderHistoryQuerySchema", () => {
  it("parses query-string values and defaults the page", () => {
    expect(orderHistoryQuerySchema.parse({ from: "2026-10-01", status: "SERVED" })).toEqual({
      from: "2026-10-01",
      status: "SERVED",
      page: 1,
    });
    expect(orderHistoryQuerySchema.parse({ page: "3" }).page).toBe(3);
  });

  it("rejects an inverted date range and invalid dates", () => {
    expect(
      orderHistoryQuerySchema.safeParse({ from: "2026-10-05", to: "2026-10-01" }).success,
    ).toBe(false);
    expect(orderHistoryQuerySchema.safeParse({ from: "2026-13-01" }).success).toBe(false);
  });
});
