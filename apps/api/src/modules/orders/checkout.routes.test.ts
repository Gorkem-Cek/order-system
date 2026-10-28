import { checkoutResponseSchema, type CheckoutRequestInput } from "@siparis/shared";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";
import {
  createMockPaymentProvider,
  MOCK_DECLINED_CARD,
  type PaymentProvider,
} from "../payments/payment-provider";

const payment = {
  method: "mock",
  cardHolder: "Ayşe Yılmaz",
  cardNumber: "4242 4242 4242 4242",
  expiry: "12/29",
  cvc: "123",
} as const;

describe.skipIf(!hasDatabase)("POST /api/menu/:qrToken/checkout", () => {
  const mock = createMockPaymentProvider();
  const payments = {
    charge: vi.fn(mock.charge),
    refund: vi.fn(mock.refund),
  } satisfies PaymentProvider;
  // 2026-10-28 14:00 in Istanbul.
  const ctx = createTestContext({}, { payments, now: () => new Date("2026-10-28T11:00:00Z") });
  afterAll(() => ctx.cleanup());
  beforeEach(() => {
    payments.charge.mockClear();
    payments.refund.mockClear();
  });

  const checkout = (
    qrToken: string,
    body: Omit<CheckoutRequestInput, "payment"> & { payment?: object },
  ) =>
    ctx.app.inject({
      method: "POST",
      url: `/api/menu/${qrToken}/checkout`,
      payload: { payment, ...body },
    });

  it("prices the cart from the database, charges the total and creates the order", async () => {
    const { table, cay, latte, option } = await ctx.createCafeWithMenu();
    const res = await checkout(table.qrToken, {
      lines: [
        {
          productId: latte.id,
          quantity: 2,
          optionIds: [option("Büyük"), option("Ekstra shot")],
          note: " Az köpük ",
        },
        { productId: cay.id, quantity: 3 },
      ],
      note: "Hepsi birlikte",
      // Anything price-like the client sends is ignored.
      ...({ totalKurus: 1 } as object),
    });

    expect(res.statusCode).toBe(201);
    const body = checkoutResponseSchema.parse(res.json());
    const expectedTotal = 2 * (16000 + 4000 + 3500) + 3 * 4000;
    expect(body).toMatchObject({ orderNumber: 1, totalKurus: expectedTotal });
    expect(payments.charge).toHaveBeenCalledWith(
      expect.objectContaining({ amountKurus: expectedTotal, description: "Test Kafe · Masa 7" }),
    );

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: body.orderId },
      include: { items: { orderBy: { productName: "asc" } } },
    });
    expect(order).toMatchObject({
      status: "NEW",
      paymentStatus: "PAID",
      paymentRef: expect.stringMatching(/^mock_/),
      tableId: table.id,
      tableName: "Masa 7",
      note: "Hepsi birlikte",
      totalKurus: expectedTotal,
    });
    expect(order.orderDate.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(order.items).toMatchObject([
      { productName: "Çay", unitPriceKurus: 4000, quantity: 3, note: null, selectedOptions: [] },
      {
        productName: "Latte",
        unitPriceKurus: 23500,
        quantity: 2,
        note: "Az köpük",
        selectedOptions: [
          { group: "Boyut", option: "Büyük", priceDeltaKurus: 4000 },
          { group: "Ekstralar", option: "Ekstra shot", priceDeltaKurus: 3500 },
        ],
      },
    ]);
  });

  it("numbers orders per café per day, even when they arrive at the same time", async () => {
    const first = await ctx.createCafeWithMenu();
    const second = await ctx.createCafeWithMenu();
    const line = (cay: { id: string }) => ({ lines: [{ productId: cay.id, quantity: 1 }] });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => checkout(first.table.qrToken, line(first.cay))),
    );
    const numbers = results.map((r) => checkoutResponseSchema.parse(r.json()).orderNumber);
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

    const other = await checkout(second.table.qrToken, line(second.cay));
    expect(other.json()).toMatchObject({ orderNumber: 1 });
  });

  it.each([
    ["a sold-out product", "PRODUCT_UNAVAILABLE"],
    ["a deleted product", "PRODUCT_NOT_FOUND"],
    ["another café's product", "PRODUCT_NOT_FOUND"],
    ["a missing required option", "TOO_FEW_OPTIONS"],
    ["a sold-out option", "OPTION_UNAVAILABLE"],
    ["another product's option", "UNKNOWN_OPTION"],
  ])("rejects %s without charging", async (scenario, reason) => {
    const { cafe, table, cay, latte, option } = await ctx.createCafeWithMenu();
    let line: { productId: string; quantity: number; optionIds?: string[] } = {
      productId: cay.id,
      quantity: 1,
    };
    if (scenario === "a sold-out product") {
      await ctx.prisma.product.update({ where: { id: cay.id }, data: { isAvailable: false } });
    } else if (scenario === "a deleted product") {
      await ctx.prisma.product.update({ where: { id: cay.id }, data: { deletedAt: new Date() } });
    } else if (scenario === "another café's product") {
      line = { productId: (await ctx.createCafeWithMenu()).cay.id, quantity: 1 };
    } else if (scenario === "a missing required option") {
      line = { productId: latte.id, quantity: 1, optionIds: [option("Ekstra shot")] };
    } else if (scenario === "a sold-out option") {
      line = { productId: latte.id, quantity: 1, optionIds: [option("Küçük"), option("Karamel")] };
    } else {
      line = { productId: cay.id, quantity: 1, optionIds: [option("Küçük")] };
    }

    // A valid line first, so the error must point at the second one.
    const valid = { productId: latte.id, quantity: 1, optionIds: [option("Küçük")] };
    const res = await checkout(table.qrToken, { lines: [valid, line] });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: { code: "INVALID_CART", details: { lineIndex: 1, reason } },
    });
    expect(payments.charge).not.toHaveBeenCalled();
    expect(await ctx.prisma.order.count({ where: { cafeId: cafe.id } })).toBe(0);
  });

  it("creates no order when the card is declined", async () => {
    const { cafe, table, cay } = await ctx.createCafeWithMenu();
    const res = await checkout(table.qrToken, {
      lines: [{ productId: cay.id, quantity: 1 }],
      payment: { ...payment, cardNumber: MOCK_DECLINED_CARD },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: { code: "PAYMENT_FAILED" } });
    expect(await ctx.prisma.order.count({ where: { cafeId: cafe.id } })).toBe(0);
  });

  it("refunds the payment if the order can't be saved", async () => {
    const { table, cay } = await ctx.createCafeWithMenu();
    // The table disappears between pricing and saving, so the insert fails.
    payments.charge.mockImplementationOnce(async (request) => {
      await ctx.prisma.table.delete({ where: { id: table.id } });
      return mock.charge(request);
    });

    const res = await checkout(table.qrToken, { lines: [{ productId: cay.id, quantity: 1 }] });
    expect(res.statusCode).toBe(500);
    expect(payments.refund).toHaveBeenCalledWith(expect.stringMatching(/^mock_/));
  });

  it("refuses orders for an inactive café or unknown table", async () => {
    const inactive = await ctx.createCafeWithMenu({ isActive: false });
    const res = await checkout(inactive.table.qrToken, {
      lines: [{ productId: inactive.cay.id, quantity: 1 }],
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "CAFE_INACTIVE" } });

    const unknown = await checkout("UnknownTableToken_000", {
      lines: [{ productId: inactive.cay.id, quantity: 1 }],
    });
    expect(unknown.statusCode).toBe(404);
    expect(payments.charge).not.toHaveBeenCalled();
  });

  it("validates the request", async () => {
    const { table } = await ctx.createCafeWithMenu();
    const res = await checkout(table.qrToken, { lines: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("is rate limited per table", async () => {
    const limited = createTestContext({ CHECKOUT_RATE_LIMIT: 1 });
    try {
      const { table, cay } = await limited.createCafeWithMenu();
      const other = await limited.createCafeWithMenu();
      const send = (qrToken: string, productId: string) =>
        limited.app.inject({
          method: "POST",
          url: `/api/menu/${qrToken}/checkout`,
          payload: { payment, lines: [{ productId, quantity: 1 }] },
        });
      expect((await send(table.qrToken, cay.id)).statusCode).toBe(201);
      expect((await send(table.qrToken, cay.id)).statusCode).toBe(429);
      expect((await send(other.table.qrToken, other.cay.id)).statusCode).toBe(201);
    } finally {
      await limited.cleanup();
    }
  });
});
