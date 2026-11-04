import {
  CAFE_ID_HEADER,
  ORDER_HISTORY_PAGE_SIZE,
  orderHistoryResponseSchema,
} from "@siparis/shared";
import { afterAll, describe, expect, it } from "vitest";
import type { OrderStatus } from "../../generated/prisma/client";
import { createTestContext, hasDatabase } from "../../test/helpers";

describe.skipIf(!hasDatabase)("GET /api/staff/orders/history", () => {
  const ctx = createTestContext();
  afterAll(() => ctx.cleanup());

  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    /** Stores an order directly, on a given business day. */
    const addOrder = (day: string, orderNumber: number, status: OrderStatus = "SERVED") =>
      ctx.prisma.order.create({
        data: {
          cafeId: menu.cafe.id,
          tableId: menu.table.id,
          tableName: menu.table.name,
          orderDate: new Date(`${day}T00:00:00.000Z`),
          orderNumber,
          status,
          totalKurus: 4000 * orderNumber,
          paymentRef: `mock_${day}_${orderNumber}`,
          items: {
            create: {
              productId: menu.cay.id,
              productName: "Çay",
              unitPriceKurus: 4000,
              quantity: orderNumber,
              selectedOptions: [],
            },
          },
        },
      });
    const history = async (query = "", headers: Record<string, string> = { cookie }) => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/staff/orders/history${query}`,
        headers,
      });
      return {
        res,
        body: res.statusCode === 200 ? orderHistoryResponseSchema.parse(res.json()) : null,
      };
    };
    return { ...menu, cookie, addOrder, history };
  }

  const numbers = (body: { orders: { orderNumber: number }[] } | null) =>
    body?.orders.map((o) => o.orderNumber);

  it("lists every order newest first, with items", async () => {
    const { addOrder, history } = await setup();
    await addOrder("2026-10-01", 1);
    await addOrder("2026-10-01", 2, "CANCELLED");
    await addOrder("2026-10-02", 1, "NEW");

    const { body } = await history();
    expect(body).toMatchObject({ page: 1, pageSize: ORDER_HISTORY_PAGE_SIZE, total: 3 });
    expect(body?.orders.map((o) => [o.orderNumber, o.status])).toEqual([
      [1, "NEW"],
      [2, "CANCELLED"],
      [1, "SERVED"],
    ]);
    expect(body?.orders[1]?.items).toMatchObject([{ productName: "Çay", quantity: 2 }]);
  });

  it("filters by business day range (inclusive) and status", async () => {
    const { addOrder, history } = await setup();
    await addOrder("2026-10-01", 1);
    await addOrder("2026-10-02", 1);
    await addOrder("2026-10-02", 2, "CANCELLED");
    await addOrder("2026-10-03", 1);

    expect(numbers((await history("?from=2026-10-02&to=2026-10-02")).body)).toEqual([2, 1]);
    const range = (await history("?from=2026-10-02&to=2026-10-03")).body;
    expect(range?.total).toBe(3);
    expect((await history("?from=2026-10-03")).body?.total).toBe(1);
    expect((await history("?to=2026-10-01")).body?.total).toBe(1);
    const cancelled = (await history("?status=CANCELLED")).body;
    expect(cancelled?.orders.map((o) => o.status)).toEqual(["CANCELLED"]);
  });

  it("pages through results", async () => {
    const { addOrder, history } = await setup();
    for (let n = 1; n <= ORDER_HISTORY_PAGE_SIZE + 2; n++) await addOrder("2026-10-05", n);

    const first = (await history()).body;
    expect(first?.orders).toHaveLength(ORDER_HISTORY_PAGE_SIZE);
    expect(first?.orders[0]?.orderNumber).toBe(ORDER_HISTORY_PAGE_SIZE + 2);
    expect(first?.total).toBe(ORDER_HISTORY_PAGE_SIZE + 2);
    expect(numbers((await history("?page=2")).body)).toEqual([2, 1]);
    expect((await history("?page=3")).body?.orders).toEqual([]);
  });

  it("rejects invalid filters", async () => {
    const { history } = await setup();
    for (const query of [
      "?from=2026-13-01",
      "?from=2026-10-05&to=2026-10-01",
      "?status=LOST",
      "?page=0",
    ]) {
      expect((await history(query)).res.statusCode).toBe(400);
    }
  });

  it("shows only the café's own orders; a super-admin picks one with the header", async () => {
    const mine = await setup();
    const other = await setup();
    await mine.addOrder("2026-10-01", 1);
    await other.addOrder("2026-10-01", 7);
    expect(numbers((await mine.history()).body)).toEqual([1]);

    const admin = await ctx.createSuperAdmin();
    const cookie = await ctx.login(admin.email);
    const asAdmin = await mine.history("", { cookie, [CAFE_ID_HEADER]: other.cafe.id });
    expect(numbers(asAdmin.body)).toEqual([7]);

    expect((await mine.history("", {})).res.statusCode).toBe(401);
  });
});
