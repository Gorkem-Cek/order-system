import { createHmac } from "node:crypto";
import {
  activeOrdersResponseSchema,
  checkoutResponseSchema,
  menuResponseSchema,
  orderSchema,
  paymentStatusResponseSchema,
  type CheckoutRequestInput,
} from "@siparis/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";
import { businessDate } from "../../lib/business-date";
import { createEventBus } from "../../lib/event-bus";
import { createSecretBox, parseSecretKey } from "../../lib/secret-box";
import { createIyzicoClient, formatPrice } from "./iyzico";
import { createIyzicoCheckoutService } from "./iyzico-checkout.service";
import { createPaymentAttemptsRepository } from "./payment-attempts.repository";

const PUBLIC_URL = "https://siparis.example";
const SECRET = "sandbox-secret-key-123";
const sign = (fields: (string | number | null)[]) =>
  createHmac("sha256", SECRET).update(fields.join(":")).digest("hex");

type Call = { path: string; body: Record<string, unknown> };
let calls: Call[];
let iyzicoDown: boolean;
/** Paths iyzico answers with an error (e.g. a cancel after the bank's cut-off). */
let refused: Set<string>;
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
  if (refused.has(path)) {
    return new Response(
      JSON.stringify({ status: "failure", errorCode: "5093", errorMessage: "Not allowed" }),
    );
  }
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
    refused = new Set();
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

  it("limits status checks per payment, not per Wi-Fi network", async () => {
    const { start, status } = await setup();
    const first = await start();
    const second = await start();
    for (let i = 0; i < 30; i++) expect((await status(first.paymentId)).statusCode).toBe(200);
    expect((await status(first.paymentId)).statusCode).toBe(429);
    expect((await status(second.paymentId)).statusCode).toBe(200);
  });

  describe("cancelling a paid order", () => {
    /** A confirmed iyzico order of ₺40 split over two basket items, plus a staff cookie. */
    async function paidOrder() {
      const menu = await setup();
      detail = (request) =>
        paid(String(request["token"]).replace("tok-", ""), 4000, {
          itemTransactions: [
            { itemId: "line-1", paymentTransactionId: "1001", paidPrice: "25" },
            { itemId: "line-2", paymentTransactionId: "1002", paidPrice: "15.5" },
          ],
        });
      const page = await menu.start();
      await menu.callback(page.paymentId, `tok-${page.paymentId}`);
      const { order } = paymentStatusResponseSchema.parse(
        (await menu.status(page.paymentId)).json(),
      );
      if (!order) throw new Error("expected an order");
      const cookie = await ctx.login(menu.loginEmail);
      calls = [];
      const cancel = () =>
        ctx.app.inject({
          method: "PATCH",
          url: `/api/staff/orders/${order.orderId}/status`,
          headers: { cookie },
          payload: { status: "CANCELLED" },
        });
      return { ...menu, page, order, cookie, cancel };
    }
    const refundCalls = () => calls.filter((c) => c.path.startsWith("/payment/re"));
    const cancelCalls = () => calls.filter((c) => c.path === "/payment/cancel");

    it("voids the payment and shows the order as refunded", async () => {
      const { cancel, page } = await paidOrder();
      const res = await cancel();
      expect(res.statusCode).toBe(200);
      expect(orderSchema.parse(res.json())).toMatchObject({
        status: "CANCELLED",
        refund: "REFUNDED",
      });
      expect(cancelCalls()).toEqual([
        {
          path: "/payment/cancel",
          body: expect.objectContaining({ paymentId: "22416032", conversationId: page.paymentId }),
        },
      ]);
      expect(refundCalls()).toEqual([]);
    });

    it("refunds every item when the payment can no longer be voided", async () => {
      const { cancel, cookie } = await paidOrder();
      refused.add("/payment/cancel");
      expect(orderSchema.parse((await cancel()).json()).refund).toBe("REFUNDED");
      expect(refundCalls().map((c) => c.body)).toEqual([
        expect.objectContaining({ paymentTransactionId: "1001", price: "25", currency: "TRY" }),
        expect.objectContaining({ paymentTransactionId: "1002", price: "15.5", currency: "TRY" }),
      ]);

      // History shows it too.
      const history = await ctx.app.inject({
        method: "GET",
        url: "/api/staff/orders/history?status=CANCELLED",
        headers: { cookie },
      });
      expect(history.json().orders).toMatchObject([{ refund: "REFUNDED" }]);
    });

    it("still cancels, but flags the refund, when iyzico won't give the money back", async () => {
      for (const failure of ["unreachable", "refused"] as const) {
        iyzicoDown = false;
        refused = new Set();
        const { cancel, page } = await paidOrder();
        if (failure === "unreachable") iyzicoDown = true;
        else refused = new Set(["/payment/cancel", "/payment/refund"]);
        const res = await cancel();
        expect(res.statusCode).toBe(200);
        expect(orderSchema.parse(res.json())).toMatchObject({
          status: "CANCELLED",
          refund: "FAILED",
        });
        // iyzico unreachable: no refund attempts after the cancel didn't get through.
        expect(refundCalls()).toHaveLength(failure === "unreachable" ? 0 : 1);
        const attempt = await ctx.prisma.paymentAttempt.findUniqueOrThrow({
          where: { id: page.paymentId },
        });
        expect(attempt.refundError).toBeTruthy();
      }
    });

    it("refunds only once", async () => {
      const { cancel } = await paidOrder();
      expect((await cancel()).statusCode).toBe(200);
      calls = [];
      // Already cancelled: no second refund.
      expect((await cancel()).statusCode).toBe(409);
      expect(calls).toEqual([]);
    });
  });

  describe("re-checking payments whose guest never came back", () => {
    const sweeper = () =>
      createIyzicoCheckoutService({
        attempts: createPaymentAttemptsRepository(ctx.prisma),
        secretBox: createSecretBox(parseSecretKey(ctx.config.PAYMENT_SECRET_KEY ?? "")),
        iyzico: (credentials) => createIyzicoClient(credentials, { fetch: iyzicoFetch }),
        events: createEventBus(),
        publicUrl: PUBLIC_URL,
        businessDate: () => businessDate(new Date()),
      });

    it("turns a paid one into an order, and fails a declined one", async () => {
      const { start, orderCount } = await setup();
      const good = await start();
      const declined = await start();
      detail = (request) => {
        const basketId = String(request["token"]).replace("tok-", "");
        return basketId === declined.paymentId
          ? paid(basketId, 4000, { paymentStatus: "FAILURE", paymentId: null })
          : paid(basketId, 4000);
      };
      await sweeper().sweepPending({ olderThanMs: 0 });

      expect(await orderCount()).toBe(1);
      const statuses = await ctx.prisma.paymentAttempt.findMany({
        where: { id: { in: [good.paymentId, declined.paymentId] } },
        select: { id: true, status: true },
      });
      expect(Object.fromEntries(statuses.map((a) => [a.id, a.status]))).toEqual({
        [good.paymentId]: "PAID",
        [declined.paymentId]: "FAILED",
      });
    });

    it("leaves recent payments to the guest's own page", async () => {
      const { start, orderCount } = await setup();
      const page = await start();
      await sweeper().sweepPending();
      expect(await orderCount()).toBe(0);
      expect(
        (await ctx.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: page.paymentId } }))
          .status,
      ).toBe("PENDING");
    });
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
