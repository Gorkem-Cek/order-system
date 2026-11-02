import { CAFE_ID_HEADER, openWaiterCallsResponseSchema } from "@siparis/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";

describe.skipIf(!hasDatabase)("waiter calls", () => {
  // A controllable clock, so the 60 s cooldown can be tested without waiting.
  let clock = new Date("2026-11-02T10:00:00Z");
  const advance = (seconds: number) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };
  const ctx = createTestContext({}, { now: () => clock });
  let adminCookie = "";

  beforeAll(async () => {
    adminCookie = await ctx.login((await ctx.createSuperAdmin()).email);
  });
  beforeEach(() => advance(3600));
  afterAll(() => ctx.cleanup());

  async function setup(options: { isActive?: boolean } = {}) {
    const menu = await ctx.createCafeWithMenu(options);
    const cookie = options.isActive === false ? "" : await ctx.login(menu.loginEmail);
    return { ...menu, cookie };
  }

  const call = (qrToken: string) =>
    ctx.app.inject({ method: "POST", url: `/api/menu/${qrToken}/waiter-call` });
  const listOpen = async (cookie: string, headers = {}) =>
    openWaiterCallsResponseSchema.parse(
      (
        await ctx.app.inject({
          method: "GET",
          url: "/api/staff/waiter-calls",
          headers: { cookie, ...headers },
        })
      ).json(),
    ).calls;
  const resolve = (cookie: string, id: string, headers = {}) =>
    ctx.app.inject({
      method: "POST",
      url: `/api/staff/waiter-calls/${id}/resolve`,
      headers: { cookie, ...headers },
    });

  it("creates a call that staff see with the table name", async () => {
    const { table, cookie } = await setup();
    const res = await call(table.qrToken);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ cooldownSeconds: 60 });

    expect(await listOpen(cookie)).toEqual([
      expect.objectContaining({
        tableName: "Masa 7",
        callCount: 1,
        createdAt: clock.toISOString(),
      }),
    ]);
  });

  it("enforces the 60 second cooldown and says how long to wait", async () => {
    const { table } = await setup();
    await call(table.qrToken);
    advance(20);
    const res = await call(table.qrToken);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      error: { code: "WAITER_CALL_COOLDOWN", details: { retryAfterSeconds: 40 } },
    });
  });

  it("re-raises an open call after the cooldown instead of creating a second one", async () => {
    const { table, cookie } = await setup();
    await call(table.qrToken);
    const firstAt = clock.toISOString();
    advance(61);
    expect((await call(table.qrToken)).statusCode).toBe(201);

    const calls = await listOpen(cookie);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      createdAt: firstAt,
      lastCalledAt: clock.toISOString(),
      callCount: 2,
    });
  });

  it("keeps the cooldown after staff resolve, then starts a new call", async () => {
    const { table, cookie } = await setup();
    await call(table.qrToken);
    const [first] = await listOpen(cookie);
    expect((await resolve(cookie, first?.id ?? "")).statusCode).toBe(204);
    expect(await listOpen(cookie)).toEqual([]);

    advance(10);
    expect((await call(table.qrToken)).statusCode).toBe(429);
    advance(60);
    expect((await call(table.qrToken)).statusCode).toBe(201);
    const [second] = await listOpen(cookie);
    expect(second?.id).not.toBe(first?.id);
    expect(second?.callCount).toBe(1);
  });

  it("lets only one of two simultaneous presses through", async () => {
    const { table, cookie } = await setup();
    const results = await Promise.all([call(table.qrToken), call(table.qrToken)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 429]);
    expect(await listOpen(cookie)).toHaveLength(1);
  });

  it("treats resolving twice as done and keeps cafés apart", async () => {
    const mine = await setup();
    const other = await setup();
    await call(other.table.qrToken);
    const [theirs] = await listOpen(other.cookie);

    expect(await listOpen(mine.cookie)).toEqual([]);
    expect((await resolve(mine.cookie, theirs?.id ?? "")).statusCode).toBe(404);

    expect((await resolve(other.cookie, theirs?.id ?? "")).statusCode).toBe(204);
    expect((await resolve(other.cookie, theirs?.id ?? "")).statusCode).toBe(204);
  });

  it("lets a super-admin see and resolve a café's calls", async () => {
    const { cafe, table } = await setup();
    await call(table.qrToken);
    const header = { [CAFE_ID_HEADER]: cafe.id };
    const [open] = await listOpen(adminCookie, header);
    expect(open?.tableName).toBe("Masa 7");
    expect((await resolve(adminCookie, open?.id ?? "", header)).statusCode).toBe(204);
  });

  it("refuses calls for an inactive café or unknown table", async () => {
    const { table } = await setup({ isActive: false });
    expect((await call(table.qrToken)).json()).toMatchObject({
      error: { code: "CAFE_INACTIVE" },
    });
    expect((await call("UnknownTableToken_000")).statusCode).toBe(404);
  });
});
