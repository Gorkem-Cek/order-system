import {
  menuProductSchema,
  menuResponseSchema,
  staffMenuResponseSchema,
  type ProductInputData,
} from "@siparis/shared";
import { afterAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";

describe.skipIf(!hasDatabase)("staff menu management", () => {
  const ctx = createTestContext();
  afterAll(() => ctx.cleanup());

  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    const send = (
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: string,
      payload?: object,
    ) =>
      ctx.app.inject({
        method,
        url: `/api/staff${url}`,
        headers: { cookie },
        ...(payload && { payload }),
      });
    const staffMenu = async () =>
      staffMenuResponseSchema.parse((await send("GET", "/menu")).json());
    const guestMenu = async () =>
      menuResponseSchema.parse(
        (await ctx.app.inject({ method: "GET", url: `/api/menu/${menu.table.qrToken}` })).json(),
      );
    return { ...menu, cookie, send, staffMenu, guestMenu };
  }

  const latteInput = (
    categoryId: string,
    overrides: Partial<ProductInputData> = {},
  ): ProductInputData => ({
    categoryId,
    name: "Flat White",
    description: "  Çift shot  ",
    priceKurus: 17500,
    optionGroups: [
      {
        name: "Süt",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { name: "Normal", priceDeltaKurus: 0 },
          { name: "Yulaf", priceDeltaKurus: 3000 },
        ],
      },
    ],
    ...overrides,
  });

  describe("categories", () => {
    it("lists every category, also empty ones, and appends new ones at the end", async () => {
      const { send, staffMenu, guestMenu } = await setup();
      const res = await send("POST", "/categories", { name: "  Tatlılar " });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: "Tatlılar", products: [] });

      expect((await staffMenu()).categories.map((c) => c.name)).toEqual(["İçecekler", "Tatlılar"]);
      // Guests don't see empty categories.
      expect((await guestMenu()).categories.map((c) => c.name)).toEqual(["İçecekler"]);
    });

    it("renames and reorders", async () => {
      const { send, staffMenu, category } = await setup();
      const second = (await send("POST", "/categories", { name: "Tatlılar" })).json().id as string;

      expect(
        (await send("PATCH", `/categories/${category.id}`, { name: "Sıcak" })).statusCode,
      ).toBe(204);
      expect(
        (await send("PUT", "/categories/order", { ids: [second, category.id] })).statusCode,
      ).toBe(204);
      expect((await staffMenu()).categories.map((c) => c.name)).toEqual(["Tatlılar", "Sıcak"]);
    });

    it("rejects a reorder that leaves out or adds a category", async () => {
      const { send, category } = await setup();
      await send("POST", "/categories", { name: "Tatlılar" });
      expect((await send("PUT", "/categories/order", { ids: [category.id] })).statusCode).toBe(400);
      const foreign = (await ctx.createCafeWithMenu()).category.id;
      expect(
        (await send("PUT", "/categories/order", { ids: [category.id, foreign] })).statusCode,
      ).toBe(400);
    });

    it("only deletes empty categories", async () => {
      const { send, staffMenu, category } = await setup();
      const res = await send("DELETE", `/categories/${category.id}`);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        error: { code: "CONFLICT", details: { reason: "CATEGORY_NOT_EMPTY" } },
      });

      const empty = (await send("POST", "/categories", { name: "Boş" })).json().id as string;
      expect((await send("DELETE", `/categories/${empty}`)).statusCode).toBe(204);
      expect((await staffMenu()).categories.map((c) => c.name)).toEqual(["İçecekler"]);
    });

    it("deletes a category whose products were all deleted, keeping order history", async () => {
      const { send, category, cay, latte, table, cafe } = await setup();
      const order = await ctx.prisma.order.create({
        data: {
          cafeId: cafe.id,
          tableId: table.id,
          tableName: table.name,
          orderNumber: 1,
          orderDate: new Date("2026-11-02"),
          totalKurus: 4000,
          paymentRef: "mock_x",
          items: {
            create: { productId: cay.id, productName: "Çay", unitPriceKurus: 4000, quantity: 1 },
          },
        },
      });
      await send("DELETE", `/products/${cay.id}`);
      await send("DELETE", `/products/${latte.id}`);

      expect((await send("DELETE", `/categories/${category.id}`)).statusCode).toBe(204);
      const [item] = await ctx.prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(item).toMatchObject({ productId: null, productName: "Çay" });
    });
  });

  describe("products", () => {
    it("creates a product with options that guests can order", async () => {
      const { send, category, guestMenu } = await setup();
      const res = await send("POST", "/products", latteInput(category.id));
      expect(res.statusCode).toBe(201);
      const product = menuProductSchema.parse(res.json());
      expect(product).toMatchObject({
        name: "Flat White",
        description: "Çift shot",
        priceKurus: 17500,
        isAvailable: true,
        optionGroups: [{ name: "Süt", options: [{ name: "Normal" }, { name: "Yulaf" }] }],
      });

      const names = (await guestMenu()).categories[0]?.products.map((p) => p.name);
      expect(names).toEqual(["Çay", "Latte", "Flat White"]);
    });

    it.each([
      ["minSelect above maxSelect", { minSelect: 2, maxSelect: 1 }],
      ["maxSelect above the number of options", { minSelect: 0, maxSelect: 3 }],
    ])("rejects %s", async (_, limits) => {
      const { send, category } = await setup();
      const input = latteInput(category.id);
      const group = { ...input.optionGroups![0]!, ...limits };
      const res = await send("POST", "/products", { ...input, optionGroups: [group] });
      expect(res.statusCode).toBe(400);
    });

    it("rejects negative or fractional prices and another café's category", async () => {
      const { send, category } = await setup();
      expect(
        (await send("POST", "/products", latteInput(category.id, { priceKurus: -1 }))).statusCode,
      ).toBe(400);
      expect(
        (await send("POST", "/products", latteInput(category.id, { priceKurus: 10.5 }))).statusCode,
      ).toBe(400);
      const foreign = (await ctx.createCafeWithMenu()).category.id;
      expect((await send("POST", "/products", latteInput(foreign))).statusCode).toBe(404);
    });

    it("keeps option ids when editing, so open carts stay valid", async () => {
      const { send, latte, option, table } = await setup();
      const before = (await send("GET", "/menu")).json().categories[0].products[1];

      // Raise the size price, rename "Küçük", drop the extras group, add a new milk group.
      const res = await send("PUT", `/products/${latte.id}`, {
        categoryId: latte.categoryId,
        name: "Latte",
        priceKurus: 17000,
        optionGroups: [
          {
            id: before.optionGroups[0].id,
            name: "Boyut",
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: option("Küçük"), name: "Small", priceDeltaKurus: 0 },
              { id: option("Büyük"), name: "Büyük", priceDeltaKurus: 5000 },
            ],
          },
          {
            name: "Süt",
            minSelect: 0,
            maxSelect: 1,
            options: [{ name: "Yulaf", priceDeltaKurus: 3000 }],
          },
        ],
      });
      expect(res.statusCode).toBe(200);
      const product = menuProductSchema.parse(res.json());
      expect(product.optionGroups.map((g) => g.name)).toEqual(["Boyut", "Süt"]);
      expect(product.optionGroups[0]?.options.map((o) => [o.id, o.name])).toEqual([
        [option("Küçük"), "Small"],
        [option("Büyük"), "Büyük"],
      ]);
      expect(await ctx.prisma.option.count({ where: { id: option("Ekstra shot") } })).toBe(0);

      // A guest who added "Büyük" before the edit can still check out, at the new price.
      const checkout = await ctx.app.inject({
        method: "POST",
        url: `/api/menu/${table.qrToken}/checkout`,
        payload: {
          lines: [{ productId: latte.id, quantity: 1, optionIds: [option("Büyük")] }],
          payment: {
            method: "mock",
            cardHolder: "Test",
            cardNumber: "4242424242424242",
            expiry: "12/29",
            cvc: "123",
          },
        },
      });
      expect(checkout.statusCode).toBe(201);
      expect(checkout.json().totalKurus).toBe(17000 + 5000);
    });

    it("never takes over an option id that belongs to another product", async () => {
      const { send, cay, option } = await setup();
      const res = await send("PUT", `/products/${cay.id}`, {
        categoryId: cay.categoryId,
        name: "Çay",
        priceKurus: 4000,
        optionGroups: [
          {
            name: "Boy",
            minSelect: 0,
            maxSelect: 1,
            options: [{ id: option("Büyük"), name: "Duble", priceDeltaKurus: 1000 }],
          },
        ],
      });
      const created = menuProductSchema.parse(res.json()).optionGroups[0]?.options[0];
      expect(created?.id).not.toBe(option("Büyük"));
      expect(await ctx.prisma.option.findUnique({ where: { id: option("Büyük") } })).toMatchObject({
        name: "Büyük",
      });
    });

    it("moves a product to the end of another category", async () => {
      const { send, cay, staffMenu } = await setup();
      const desserts = (await send("POST", "/categories", { name: "Tatlılar" })).json()
        .id as string;
      await send("POST", "/products", latteInput(desserts, { name: "Brownie", optionGroups: [] }));
      await send("PUT", `/products/${cay.id}`, {
        categoryId: desserts,
        name: "Çay",
        priceKurus: 4000,
      });

      const menu = await staffMenu();
      expect(menu.categories.map((c) => [c.name, c.products.map((p) => p.name)])).toEqual([
        ["İçecekler", ["Latte"]],
        ["Tatlılar", ["Brownie", "Çay"]],
      ]);
    });

    it("reorders products within a category", async () => {
      const { send, category, cay, latte, staffMenu } = await setup();
      const res = await send("PUT", `/categories/${category.id}/products/order`, {
        ids: [latte.id, cay.id],
      });
      expect(res.statusCode).toBe(204);
      expect((await staffMenu()).categories[0]?.products.map((p) => p.name)).toEqual([
        "Latte",
        "Çay",
      ]);
      expect(
        (await send("PUT", `/categories/${category.id}/products/order`, { ids: [latte.id] }))
          .statusCode,
      ).toBe(400);
    });

    it("toggles availability", async () => {
      const { send, cay, guestMenu } = await setup();
      const res = await send("PATCH", `/products/${cay.id}/availability`, { isAvailable: false });
      expect(res.json()).toMatchObject({ isAvailable: false });
      expect((await guestMenu()).categories[0]?.products[0]).toMatchObject({
        name: "Çay",
        isAvailable: false,
      });
    });

    it("soft-deletes products", async () => {
      const { send, cay, staffMenu, guestMenu } = await setup();
      expect((await send("DELETE", `/products/${cay.id}`)).statusCode).toBe(204);
      expect((await staffMenu()).categories[0]?.products.map((p) => p.name)).toEqual(["Latte"]);
      expect((await guestMenu()).categories[0]?.products.map((p) => p.name)).toEqual(["Latte"]);
      expect(await ctx.prisma.product.findUnique({ where: { id: cay.id } })).toMatchObject({
        deletedAt: expect.any(Date),
      });
      // Already deleted → not found.
      expect((await send("DELETE", `/products/${cay.id}`)).statusCode).toBe(404);
    });
  });

  it("keeps cafés apart", async () => {
    const mine = await setup();
    const other = await ctx.createCafeWithMenu();
    expect(
      (await mine.send("PATCH", `/products/${other.cay.id}/availability`, { isAvailable: false }))
        .statusCode,
    ).toBe(404);
    expect((await mine.send("DELETE", `/products/${other.cay.id}`)).statusCode).toBe(404);
    expect(
      (await mine.send("PATCH", `/categories/${other.category.id}`, { name: "x" })).statusCode,
    ).toBe(404);
    const names = (await mine.staffMenu()).categories.flatMap((c) => c.products.map((p) => p.id));
    expect(names).not.toContain(other.cay.id);
  });

  it("requires a login", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/staff/menu" })).statusCode).toBe(401);
  });
});
