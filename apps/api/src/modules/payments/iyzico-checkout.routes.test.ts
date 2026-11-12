import { createHmac } from "node:crypto";
import {
  activeOrdersResponseSchema,
  checkoutResponseSchema,
  menuResponseSchema,
  paymentStatusResponseSchema,
  type CheckoutRequestInput,
} from "@siparis/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";
import { formatPrice } from "./iyzico";

const PUBLIC_URL = "https://siparis.example";
const SECRET = "sandbox-secret-key-123";
const sign = (fields: (string | number | null)[]) =>
  createHmac("sha256", SECRET).update(fields.join(":")).digest("hex");

type Call = { path: string; body: Record<string, unknown> };
let calls: Call[];
let iyzicoDown: boolean;
/** How iyzico answers the payment lookup; defaults to a successful payment. */
let detail: (request: Record<string, unknown>) => Record<string, unknown>;

/** A signed successful result for the payment whose token/basket is given. */
function paid(basketId: string, totalKurus: number, overrides: Record<string, unknown> = {}) {
  const result = {
    status: "success",
    paymentStatus: "SUCCESS",
    paymentId: "22416032",
    currency: "TRY",
    basketId,
    conversationId: basketId,
    paidPrice: `${formatPrice(totalKurus)}.0`,
    price: formatPrice(totalKurus),
    token: `tok-${basketId}`,
    fraudStatus: 1,
    itemTransactions: [{ itemId: "line-1", paymentTransactionId: "1001", paidPrice: "1" }],
    ...overrides,
  };
  return {
    ...result,
    signature: sign([
      result.paymentStatus,
      result.paymentId,
      result.currency,
      result.basketId,
      result.conversationId,
      formatPrice(Math.round(Number(result.paidPrice) * 100)),
      formatPrice(Math.round(Number(result.price) * 100)),
      result.token,
    ]),
  };
}

const iyzicoFetch = (async (url: string, init: RequestInit) => {
  const path = new URL(url).pathname;
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  calls.push({ path, body });
  if (iyzicoDown && path !== "/payment/bin/check") throw new TypeError("fetch failed");
  const answer =
    path === "/payment/iyzipos/checkoutform/initialize/auth/ecom"
      ? {
          status: "success",
          token: `tok-${body["basketId"]}`,
          paymentPageUrl: `https://sandbox-cpp.iyzipay.com?token=tok-${body["basketId"]}`,
        }
      : path === "/payment/iyzipos/checkoutform/auth/ecom/detail"
        ? detail(body)
        : { status: "success" };
  return new Response(JSON.stringify(answer));
}) as typeof fetch;

describe.skipIf(!hasDatabase)("checkout through iyzico", () => {
  const ctx = createTestContext({ PUBLIC_URL }, { iyzicoFetch });
  let adminCookie = "";
  beforeAll(async () => {
    adminCookie = await ctx.login((await ctx.createSuperAdmin()).email);
  });
  afterAll(() => ctx.cleanup());
  beforeEach(() => {
    calls = [];
    iyzicoDown = false;
    detail = (request) => {
      const basketId = String(request["token"]).replace("tok-", "");
      return paid(basketId, 4000);
    };
  });

  const buyer = {
    name: "Ayşe",
    surname: "Yılmaz",
    email: "Ayse@Example.com",
    phone: "0555 111 22 33",
  };

  /** A café with its iyzico sandbox account connected, plus helpers for its table. */
  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/cafes/${menu.cafe.id}/payment`,
      headers: { cookie: adminCookie },
      payload: {
        mode: "SANDBOX",
        address: "Moda Cad. No 1",
        city: "İstanbul",
        apiKey: "sandbox-api-key-1",
        secretKey: SECRET,
      },
    });
    expect(res.statusCode).toBe(200);
    calls = [];
    const qr = menu.table.qrToken;
    const checkout = (payload: CheckoutRequestInput) =>
      ctx.app.inject({ method: "POST", url: `/api/menu/${qr}/checkout`, payload });
    const callback = (paymentId: string, token: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/api/payments/iyzico/callback/${paymentId}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({ token }).toString(),
      });
    const status = (paymentId: string, qrToken = qr) =>
      ctx.app.inject({ method: "GET", url: `/api/menu/${qrToken}/payments/${paymentId}` });
    const tea = { lines: [{ productId: menu.cay.id, quantity: 1 }] };
    const start = async (
      payload: CheckoutRequestInput = { ...tea, payment: { method: "iyzico", buyer } },
    ) => {
      const res = await checkout(payload);
      expect(res.statusCode).toBe(200);
      const body = checkoutResponseSchema.parse(res.json());
      if (body.kind !== "redirect") throw new Error("expected a redirect");
      return body;
    };
    const orderCount = () => ctx.prisma.order.count({ where: { cafeId: menu.cafe.id } });
    return { ...menu, checkout, callback, status, start, tea, orderCount };
  }

  it("tells guests to pay with iyzico and refuses the fake card", async () => {
    const { table, checkout, tea } = await setup();
    const menu = await ctx.app.inject({ method: "GET", url: `/api/menu/${table.qrToken}` });
    expect(menuResponseSchema.parse(menu.json()).paymentMethod).toBe("iyzico");

    const fake = await checkout({
      ...tea,
      payment: {
        method: "mock",
        cardHolder: "A B",
        cardNumber: "4242424242424242",
        expiry: "12/35",
        cvc: "123",
      },
    });
    expect(fake.statusCode).toBe(400);
    expect(fake.json().error.details).toMatchObject({
      reason: "PAYMENT_METHOD",
      expected: "iyzico",
    });
  });

  it("opens iyzico's page with the priced basket and the guest's contact details", async () => {
    const { start, cafe, latte, option } = await setup();
    const page = await start({
      lines: [
        { productId: latte.id, quantity: 2, optionIds: [option("Büyük"), option("Ekstra shot")] },
      ],
      note: "Hepsi birlikte",
      payment: { method: "iyzico", buyer, locale: "en" },
    });
    expect(page.paymentPageUrl).toBe(`https://sandbox-cpp.iyzipay.com?token=tok-${page.paymentId}`);

    const init = calls.find((c) => c.path.endsWith("/initialize/auth/ecom"));
    expect(init?.body).toMatchObject({
      basketId: page.paymentId,
      price: "470",
      locale: "en",
      callbackUrl: `${PUBLIC_URL}/api/payments/iyzico/callback/${page.paymentId}`,
      buyer: {
        name: "Ayşe",
        surname: "Yılmaz",
        email: "ayse@example.com",
        gsmNumber: "+905551112233",
        identityNumber: "11111111111",
        city: "İstanbul",
      },
      billingAddress: { contactName: "Test Kafe", address: "Moda Cad. No 1" },
      basketItems: [{ id: "line-1", name: "Latte", price: "470" }],
    });

    // The order waits for iyzico, and nothing the guest typed is stored.
    const attempt = await ctx.prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: page.paymentId },
    });
    expect(attempt).toMatchObject({ status: "PENDING", totalKurus: 47000, cafeId: cafe.id });
    expect(JSON.stringify(attempt)).not.toMatch(/ayse|555|Yılmaz/i);
  });

  it("creates the order once iyzico confirms, and only once", async () => {
    const { start, callback, status, orderCount, table, loginEmail } = await setup();
    const page = await start();
    expect(await orderCount()).toBe(0);

    const back = await callback(page.paymentId, `tok-${page.paymentId}`);
    expect(back.statusCode).toBe(303);
    expect(back.headers.location).toBe(`/m/${table.qrToken}?payment=${page.paymentId}`);

    // The browser may arrive twice, and the menu checks the status too.
    await callback(page.paymentId, `tok-${page.paymentId}`);
    const result = paymentStatusResponseSchema.parse((await status(page.paymentId)).json());
    expect(result).toMatchObject({ status: "PAID", order: { orderNumber: 1, totalKurus: 4000 } });
    expect(await orderCount()).toBe(1);

    const order = await ctx.prisma.order.findFirstOrThrow({
      where: { id: result.order?.orderId },
      include: { items: true },
    });
    expect(order).toMatchObject({ paymentRef: "iyzico:22416032", tableName: "Masa 7" });
    expect(order.items).toMatchObject([{ productName: "Çay", quantity: 1, unitPriceKurus: 4000 }]);
    const attempt = await ctx.prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: page.paymentId },
    });
    expect(attempt).toMatchObject({ status: "PAID", orderId: order.id, paymentId: "22416032" });
    expect(attempt.transactions).toEqual([
      { itemId: "line-1", paymentTransactionId: "1001", paidPriceKurus: 100 },
    ]);

    // Staff see it on the board.
    const cookie = await ctx.login(loginEmail);
    const board = await ctx.app.inject({
      method: "GET",
      url: "/api/staff/orders",
      headers: { cookie },
    });
    expect(activeOrdersResponseSchema.parse(board.json()).orders.map((o) => o.id)).toEqual([
      order.id,
    ]);
  });

  it("marks a declined payment as failed without an order", async () => {
    const { start, callback, status, orderCount } = await setup();
    detail = (request) => {
      const basketId = String(request["token"]).replace("tok-", "");
      return paid(basketId, 4000, { paymentStatus: "FAILURE", paymentId: null });
    };
    const page = await start();
    await callback(page.paymentId, `tok-${page.paymentId}`);
    expect((await status(page.paymentId)).json()).toEqual({ status: "FAILED", order: null });
    expect(await orderCount()).toBe(0);
  });

  it("voids a payment that doesn't match the order, or that iyzico flags for fraud", async () => {
    for (const overrides of [
      { paidPrice: "1.0", price: "1" },
      { fraudStatus: 0 },
      { fraudStatus: -1 },
    ]) {
      const { start, callback, status, orderCount } = await setup();
      detail = (request) => paid(String(request["token"]).replace("tok-", ""), 4000, overrides);
      const page = await start();
      calls = [];
      await callback(page.paymentId, `tok-${page.paymentId}`);
      expect((await status(page.paymentId)).json().status).toBe("FAILED");
      expect(await orderCount()).toBe(0);
      expect(calls.filter((c) => c.path === "/payment/cancel")).toEqual([
        { path: "/payment/cancel", body: expect.objectContaining({ paymentId: "22416032" }) },
      ]);
    }
  });

  it("ignores a callback with another payment's token", async () => {
    const { start, callback, orderCount } = await setup();
    const page = await start();
    const other = await start();
    calls = [];
    await callback(page.paymentId, `tok-${other.paymentId}`);
    expect(calls.filter((c) => c.path.endsWith("/detail"))).toEqual([]);
    expect(await orderCount()).toBe(0);
    const attempt = await ctx.prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: page.paymentId },
    });
    expect(attempt.status).toBe("PENDING");
  });

  it("stays pending while iyzico can't be reached, and confirms later", async () => {
    const { start, callback, status, orderCount } = await setup();
    const page = await start();
    iyzicoDown = true;
    await callback(page.paymentId, `tok-${page.paymentId}`);
    expect((await status(page.paymentId)).json()).toEqual({ status: "PENDING", order: null });
    expect(await orderCount()).toBe(0);

    iyzicoDown = false;
    expect((await status(page.paymentId)).json().status).toBe("PAID");
    expect(await orderCount()).toBe(1);
  });

  it("says when iyzico's page can't be opened", async () => {
    const { checkout, tea, cafe } = await setup();
    iyzicoDown = true;
    const res = await checkout({ ...tea, payment: { method: "iyzico", buyer } });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    const attempt = await ctx.prisma.paymentAttempt.findFirstOrThrow({
      where: { cafeId: cafe.id },
    });
    expect(attempt.status).toBe("FAILED");
  });

  it("validates the guest's details", async () => {
    const { checkout, tea } = await setup();
    for (const bad of [
      { ...buyer, email: "not-an-email" },
      { ...buyer, phone: "123" },
      { ...buyer, name: "A" },
    ]) {
      const res = await checkout({ ...tea, payment: { method: "iyzico", buyer: bad } });
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("keeps payments private to their table", async () => {
    const { start, status } = await setup();
    const other = await ctx.createCafeWithMenu();
    const page = await start();
    expect((await status(page.paymentId, other.table.qrToken)).statusCode).toBe(404);
    expect((await status("cl0000000000000000000000")).statusCode).toBe(404);
  });
});

describe.skipIf(!hasDatabase)("checkout without real payments allowed", () => {
  const ctx = createTestContext({ ALLOW_MOCK_PAYMENTS: false }, { iyzicoFetch });
  afterAll(() => ctx.cleanup());

  it("refuses orders until the café's iyzico account is connected", async () => {
    const { table, cay } = await ctx.createCafeWithMenu();
    const menu = await ctx.app.inject({ method: "GET", url: `/api/menu/${table.qrToken}` });
    expect(menuResponseSchema.parse(menu.json()).paymentMethod).toBe("none");

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/menu/${table.qrToken}/checkout`,
      payload: {
        lines: [{ productId: cay.id, quantity: 1 }],
        payment: {
          method: "mock",
          cardHolder: "A B",
          cardNumber: "4242424242424242",
          expiry: "12/35",
          cvc: "123",
        },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PAYMENTS_NOT_SET_UP");
  });
});
