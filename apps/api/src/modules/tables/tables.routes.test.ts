import {
  CAFE_ID_HEADER,
  MAX_TABLES_PER_CAFE,
  openWaiterCallsResponseSchema,
  staffTableSchema,
  staffTablesResponseSchema,
} from "@siparis/shared";
import { afterAll, describe, expect, it } from "vitest";
import { generateQrToken } from "../../lib/tokens";
import { createTestContext, hasDatabase } from "../../test/helpers";

const PUBLIC_URL = "https://siparis.example";

describe.skipIf(!hasDatabase)("table management", () => {
  const ctx = createTestContext({ PUBLIC_URL });
  afterAll(() => ctx.cleanup());

  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    const send = (method: "GET" | "POST" | "PATCH" | "DELETE", url = "", payload?: object) =>
      ctx.app.inject({
        method,
        url: `/api/staff/tables${url}`,
        headers: { cookie },
        ...(payload && { payload }),
      });
    const list = async () => staffTablesResponseSchema.parse((await send("GET")).json()).tables;
    const guestMenu = (qrToken: string) =>
      ctx.app.inject({ method: "GET", url: `/api/menu/${qrToken}` });
    return { ...menu, cookie, send, list, guestMenu };
  }

  it("lists tables in natural order with their link and QR code", async () => {
    const { send, list, table } = await setup();
    for (const name of ["Masa 10", "Bahçe 1", "Masa 2"]) await send("POST", "", { name });

    const tables = await list();
    expect(tables.map((t) => t.name)).toEqual(["Bahçe 1", "Masa 2", "Masa 7", "Masa 10"]);
    const masa7 = tables.find((t) => t.id === table.id);
    expect(masa7?.menuUrl).toBe(`${PUBLIC_URL}/m/${table.qrToken}`);
    expect(masa7?.qrSvg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });

  it("creates a table whose QR link opens the menu", async () => {
    const { send, guestMenu } = await setup();
    const res = await send("POST", "", { name: "  Teras 3 " });
    expect(res.statusCode).toBe(201);
    const created = staffTableSchema.parse(res.json());
    expect(created.name).toBe("Teras 3");
    expect(created.menuUrl).toBe(`${PUBLIC_URL}/m/${created.qrToken}`);

    const menu = await guestMenu(created.qrToken);
    expect(menu.statusCode).toBe(200);
    expect(menu.json().table).toMatchObject({ name: "Teras 3" });
  });

  it("rejects empty and duplicate names (ignoring case)", async () => {
    const { send, table } = await setup();
    expect((await send("POST", "", { name: "   " })).statusCode).toBe(400);
    const duplicate = await send("POST", "", { name: "masa 7" });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toMatchObject({ code: "CONFLICT", details: { field: "name" } });

    const other = staffTableSchema.parse((await send("POST", "", { name: "Masa 8" })).json());
    expect((await send("PATCH", `/${other.id}`, { name: "MASA 7" })).statusCode).toBe(409);
    // Renaming a table to its own name (or a different case of it) is fine.
    expect((await send("PATCH", `/${table.id}`, { name: "MASA 7" })).statusCode).toBe(200);
  });

  it("renames a table; the QR code stays the same", async () => {
    const { send, table, guestMenu } = await setup();
    const res = await send("PATCH", `/${table.id}`, { name: "Pencere 1" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Pencere 1", qrToken: table.qrToken });
    expect((await guestMenu(table.qrToken)).json().table).toMatchObject({ name: "Pencere 1" });
  });

  it("regenerates the QR code; the old one stops working", async () => {
    const { send, table, guestMenu } = await setup();
    const res = await send("POST", `/${table.id}/qr`);
    expect(res.statusCode).toBe(200);
    const updated = staffTableSchema.parse(res.json());
    expect(updated.qrToken).not.toBe(table.qrToken);
    expect(updated.name).toBe("Masa 7");

    expect((await guestMenu(table.qrToken)).statusCode).toBe(404);
    expect((await guestMenu(updated.qrToken)).statusCode).toBe(200);
  });

  it("deletes a table; its open waiter call goes, its orders stay", async () => {
    const { send, list, table, cafe, cookie, guestMenu } = await setup();
    await ctx.app.inject({ method: "POST", url: `/api/menu/${table.qrToken}/waiter-call` });
    const order = await ctx.prisma.order.create({
      data: {
        cafeId: cafe.id,
        tableId: table.id,
        tableName: table.name,
        orderNumber: 1,
        orderDate: new Date("2026-01-01"),
        totalKurus: 4000,
        paymentStatus: "PAID",
        paymentRef: "mock_test",
      },
    });

    expect((await send("DELETE", `/${table.id}`)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await guestMenu(table.qrToken)).statusCode).toBe(404);

    const calls = await ctx.app.inject({
      method: "GET",
      url: "/api/staff/waiter-calls",
      headers: { cookie },
    });
    expect(openWaiterCallsResponseSchema.parse(calls.json()).calls).toEqual([]);
    expect(await ctx.prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({
      tableId: null,
      tableName: "Masa 7",
    });
  });

  it("returns 404 for unknown tables and other cafés' tables", async () => {
    const { send } = await setup();
    const other = await ctx.createCafeWithMenu();
    for (const res of [
      await send("PATCH", `/${other.table.id}`, { name: "Benim" }),
      await send("POST", `/${other.table.id}/qr`),
      await send("DELETE", `/${other.table.id}`),
      await send("DELETE", "/cl0000000000000000000000"),
    ]) {
      expect(res.statusCode).toBe(404);
    }
    expect(await ctx.prisma.table.findUnique({ where: { id: other.table.id } })).toMatchObject({
      name: "Masa 7",
      qrToken: other.table.qrToken,
    });
  });

  it("stops at the table limit", async () => {
    const { cafe, send } = await setup();
    await ctx.prisma.table.createMany({
      data: Array.from({ length: MAX_TABLES_PER_CAFE - 1 }, (_, i) => ({
        cafeId: cafe.id,
        name: `Ek ${i}`,
        qrToken: generateQrToken(),
      })),
    });
    const res = await send("POST", "", { name: "Bir fazla" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details).toEqual({ reason: "TABLE_LIMIT" });
  });

  it("needs a login; a super-admin picks the café with the header", async () => {
    const { cafe } = await setup();
    expect((await ctx.app.inject({ method: "GET", url: "/api/staff/tables" })).statusCode).toBe(
      401,
    );

    const admin = await ctx.createSuperAdmin();
    const cookie = await ctx.login(admin.email);
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/staff/tables",
      headers: { cookie, [CAFE_ID_HEADER]: cafe.id },
    });
    expect(res.statusCode).toBe(200);
    expect(staffTablesResponseSchema.parse(res.json()).tables.map((t) => t.name)).toEqual([
      "Masa 7",
    ]);
  });
});
