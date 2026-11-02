import { CAFE_ID_QUERY, staffEventSchema, type StaffEvent } from "@siparis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";

type SseMessage = { event: string; data: unknown };

/** Opens an SSE stream with fetch and lets the test wait for specific messages. */
async function openStream(url: string, cookie?: string) {
  const controller = new AbortController();
  const res = await fetch(url, {
    headers: cookie ? { cookie } : {},
    signal: controller.signal,
  });
  const messages: SseMessage[] = [];
  const waiters: (() => void)[] = [];

  if (res.ok && res.body) {
    void (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const field = (name: string) =>
              block
                .split("\n")
                .find((line) => line.startsWith(`${name}: `))
                ?.slice(name.length + 2);
            const event = field("event");
            const data = field("data");
            if (event && data) messages.push({ event, data: JSON.parse(data) });
            waiters.splice(0).forEach((wake) => wake());
          }
        }
      } catch {
        // Aborted by close().
      }
    })();
  }

  return {
    res,
    async next(predicate: (m: SseMessage) => boolean, timeoutMs = 3000): Promise<SseMessage> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const index = messages.findIndex(predicate);
        if (index !== -1) return messages.splice(index, 1)[0] as SseMessage;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("Timed out waiting for an SSE message");
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, left);
        });
      }
    },
    received: () => [...messages],
    close: () => controller.abort(),
  };
}

const isEvent =
  (type: StaffEvent["type"]) =>
  (m: SseMessage): boolean =>
    m.event === type;

describe.skipIf(!hasDatabase)("GET /api/staff/events", () => {
  const ctx = createTestContext();
  let baseUrl = "";
  let adminCookie = "";

  beforeAll(async () => {
    baseUrl = await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    adminCookie = await ctx.login((await ctx.createSuperAdmin()).email);
  });
  afterAll(() => ctx.cleanup());

  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    const placeOrder = async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/api/menu/${menu.table.qrToken}/checkout`,
        payload: {
          lines: [{ productId: menu.cay.id, quantity: 1 }],
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

  it("streams new orders and status changes for the staff user's café", async () => {
    const { cookie, placeOrder } = await setup();
    const stream = await openStream(`${baseUrl}/api/staff/events`, cookie);
    try {
      expect(stream.res.status).toBe(200);
      expect(stream.res.headers.get("content-type")).toMatch(/^text\/event-stream/);
      await stream.next((m) => m.event === "ready");

      const orderId = await placeOrder();
      const created = staffEventSchema.parse((await stream.next(isEvent("order.created"))).data);
      expect(created).toMatchObject({
        type: "order.created",
        order: { id: orderId, status: "NEW", tableName: "Masa 7" },
      });

      await ctx.app.inject({
        method: "PATCH",
        url: `/api/staff/orders/${orderId}/status`,
        headers: { cookie },
        payload: { status: "PREPARING" },
      });
      const updated = staffEventSchema.parse((await stream.next(isEvent("order.updated"))).data);
      expect(updated).toMatchObject({ order: { id: orderId, status: "PREPARING" } });
    } finally {
      stream.close();
    }
  });

  it("never sends another café's orders", async () => {
    const mine = await setup();
    const other = await setup();
    const stream = await openStream(`${baseUrl}/api/staff/events`, mine.cookie);
    try {
      await stream.next((m) => m.event === "ready");
      await other.placeOrder();
      const myOrder = await mine.placeOrder();

      const created = await stream.next(isEvent("order.created"));
      expect(created.data).toMatchObject({ order: { id: myOrder } });
      expect(stream.received()).toEqual([]);
    } finally {
      stream.close();
    }
  });

  it("lets a super-admin follow a café with ?cafeId=", async () => {
    const { cafe, placeOrder } = await setup();
    const stream = await openStream(
      `${baseUrl}/api/staff/events?${CAFE_ID_QUERY}=${cafe.id}`,
      adminCookie,
    );
    try {
      await stream.next((m) => m.event === "ready");
      const orderId = await placeOrder();
      expect((await stream.next(isEvent("order.created"))).data).toMatchObject({
        order: { id: orderId },
      });
    } finally {
      stream.close();
    }
  });

  it("requires a login", async () => {
    const stream = await openStream(`${baseUrl}/api/staff/events`);
    expect(stream.res.status).toBe(401);
    stream.close();
  });
});
