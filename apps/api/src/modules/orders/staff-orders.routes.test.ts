import { activeOrdersResponseSchema, CAFE_ID_HEADER, orderSchema } from "@siparis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";

describe.skipIf(!hasDatabase)("staff order routes", () => {
  const ctx = createTestContext();
  let adminCookie = "";
  beforeAll(async () => {
    adminCookie = await ctx.login((await ctx.createSuperAdmin()).email);
  });
  afterAll(() => ctx.cleanup());

  /** A café with its staff session and a helper that places a paid order through checkout. */
  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    const placeOrder = async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/api/menu/${menu.table.qrToken}/checkout`,
        payload: {
          lines: [{ productId: menu.cay.id, quantity: 2, note: "Demli" }],
          payment: {
            method: "mock",
            cardHolder: "Test",
            cardNumber: "4242424242424242",
            expiry: "12/29",
            cvc: "123",
          },
        },
      });
      return res.json().orderId as string;
    };
    return { ...menu, cookie, placeOrder };
  }

  const setStatus = (cookie: string, orderId: string, status: string, headers = {}) =>
    ctx.app.inject({
      method: "PATCH",
      url: `/api/staff/orders/${orderId}/status`,
      headers: { cookie, ...headers },
      payload: { status },
    });
  const listActive = (cookie: string, headers = {}) =>
    ctx.app.inject({ method: "GET", url: "/api/staff/orders", headers: { cookie, ...headers } });

  it("lists new and preparing orders, oldest first, with their items", async () => {
    const { cookie, placeOrder } = await setup();
    const first = await placeOrder();
    const second = await placeOrder();
    const served = await placeOrder();
    await setStatus(cookie, second, "PREPARING");
    await setStatus(cookie, served, "PREPARING");
    await setStatus(cookie, served, "SERVED");

    const res = await listActive(cookie);
    expect(res.statusCode).toBe(200);
    const { orders } = activeOrdersResponseSchema.parse(res.json());
    expect(orders.map((o) => [o.id, o.status])).toEqual([
      [first, "NEW"],
      [second, "PREPARING"],
    ]);
    expect(orders[0]).toMatchObject({
      orderNumber: 1,
      tableName: "Masa 7",
      totalKurus: 8000,
      items: [{ productName: "Çay", quantity: 2, unitPriceKurus: 4000, note: "Demli" }],
    });
  });

  it("moves an order new → preparing → served", async () => {
    const { cookie, placeOrder } = await setup();
    const orderId = await placeOrder();

    const preparing = await setStatus(cookie, orderId, "PREPARING");
    expect(preparing.statusCode).toBe(200);
    expect(orderSchema.parse(preparing.json()).status).toBe("PREPARING");

    const served = await setStatus(cookie, orderId, "SERVED");
    expect(orderSchema.parse(served.json()).status).toBe("SERVED");
  });

  it("cancels from new or preparing, but not after serving", async () => {
    const { cookie, placeOrder } = await setup();
    const fromNew = await placeOrder();
    expect((await setStatus(cookie, fromNew, "CANCELLED")).json()).toMatchObject({
      status: "CANCELLED",
    });

    const fromPreparing = await placeOrder();
    await setStatus(cookie, fromPreparing, "PREPARING");
    expect((await setStatus(cookie, fromPreparing, "CANCELLED")).statusCode).toBe(200);

    const servedOrder = await placeOrder();
    await setStatus(cookie, servedOrder, "PREPARING");
    await setStatus(cookie, servedOrder, "SERVED");
    const res = await setStatus(cookie, servedOrder, "CANCELLED");
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: { code: "INVALID_STATUS_TRANSITION", details: { from: "SERVED", to: "CANCELLED" } },
    });
  });

  it("rejects skipping a step and moving back to NEW", async () => {
    const { cookie, placeOrder } = await setup();
    const orderId = await placeOrder();
    expect((await setStatus(cookie, orderId, "SERVED")).statusCode).toBe(409);
    expect((await setStatus(cookie, orderId, "NEW")).statusCode).toBe(400);
  });

  it("lets only one of two screens apply the same change at once", async () => {
    const { cookie, placeOrder } = await setup();
    for (let attempt = 0; attempt < 5; attempt++) {
      const orderId = await placeOrder();
      const results = await Promise.all([
        setStatus(cookie, orderId, "PREPARING"),
        setStatus(cookie, orderId, "PREPARING"),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    }
  });

  it("keeps cafés apart", async () => {
    const mine = await setup();
    const other = await setup();
    const theirOrder = await other.placeOrder();

    expect((await setStatus(mine.cookie, theirOrder, "PREPARING")).statusCode).toBe(404);
    const { orders } = activeOrdersResponseSchema.parse((await listActive(mine.cookie)).json());
    expect(orders.map((o) => o.id)).not.toContain(theirOrder);
  });

  it("lets a super-admin manage a café's orders with X-Cafe-Id", async () => {
    const { cafe, placeOrder } = await setup();
    const orderId = await placeOrder();
    const header = { [CAFE_ID_HEADER]: cafe.id };

    const list = activeOrdersResponseSchema.parse((await listActive(adminCookie, header)).json());
    expect(list.orders.map((o) => o.id)).toContain(orderId);
    expect((await setStatus(adminCookie, orderId, "PREPARING", header)).statusCode).toBe(200);
  });

  it("requires a login", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/staff/orders" });
    expect(res.statusCode).toBe(401);
  });
});
