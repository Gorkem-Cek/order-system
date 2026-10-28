import { menuResponseSchema } from "@siparis/shared";
import { afterAll, describe, expect, it } from "vitest";
import { generateQrToken } from "../../lib/tokens";
import { createTestContext, hasDatabase } from "../../test/helpers";

describe.skipIf(!hasDatabase)("GET /api/menu/:qrToken", () => {
  const ctx = createTestContext();
  afterAll(() => ctx.cleanup());

  const getMenu = (qrToken: string) =>
    ctx.app.inject({ method: "GET", url: `/api/menu/${qrToken}` });

  async function createMenuCafe(options: { cafeActive?: boolean; tableActive?: boolean } = {}) {
    const { cafe } = await ctx.createCafe({ isActive: options.cafeActive ?? true });
    const table = await ctx.prisma.table.create({
      data: {
        cafeId: cafe.id,
        name: "Masa 3",
        qrToken: generateQrToken(),
        isActive: options.tableActive ?? true,
      },
    });
    const drinks = await ctx.prisma.category.create({
      data: { cafeId: cafe.id, name: "İçecekler", sortOrder: 1 },
    });
    const desserts = await ctx.prisma.category.create({
      data: { cafeId: cafe.id, name: "Tatlılar", sortOrder: 0 },
    });
    await ctx.prisma.category.create({ data: { cafeId: cafe.id, name: "Boş", sortOrder: 2 } });

    const product = (data: { name: string; categoryId: string; sortOrder: number }) =>
      ctx.prisma.product.create({ data: { cafeId: cafe.id, priceKurus: 10000, ...data } });
    await product({ name: "Latte", categoryId: drinks.id, sortOrder: 1 });
    await product({ name: "Çay", categoryId: drinks.id, sortOrder: 0 });
    await ctx.prisma.product.create({
      data: {
        cafeId: cafe.id,
        categoryId: drinks.id,
        name: "Eski Ürün",
        priceKurus: 5000,
        deletedAt: new Date(),
      },
    });
    await ctx.prisma.product.create({
      data: {
        cafeId: cafe.id,
        categoryId: desserts.id,
        name: "Brownie",
        priceKurus: 15000,
        isAvailable: false,
        optionGroups: {
          create: {
            name: "Ekstra",
            minSelect: 0,
            maxSelect: 1,
            options: { create: { name: "Dondurma", priceDeltaKurus: 4000 } },
          },
        },
      },
    });
    return { cafe, table };
  }

  it("returns the café's menu in sort order", async () => {
    const { cafe, table } = await createMenuCafe();
    const res = await getMenu(table.qrToken);
    expect(res.statusCode).toBe(200);

    const menu = menuResponseSchema.parse(res.json());
    expect(menu.cafe).toMatchObject({ name: cafe.name, slug: cafe.slug });
    expect(menu.table).toEqual({ name: "Masa 3" });
    expect(menu.categories.map((c) => c.name)).toEqual(["Tatlılar", "İçecekler"]);
    expect(menu.categories[1]?.products.map((p) => p.name)).toEqual(["Çay", "Latte"]);
  });

  it("hides deleted products and empty categories but shows unavailable products", async () => {
    const { table } = await createMenuCafe();
    const menu = menuResponseSchema.parse((await getMenu(table.qrToken)).json());
    const names = menu.categories.flatMap((c) => c.products.map((p) => p.name));

    expect(names).not.toContain("Eski Ürün");
    expect(menu.categories.map((c) => c.name)).not.toContain("Boş");
    const brownie = menu.categories[0]?.products[0];
    expect(brownie).toMatchObject({ name: "Brownie", isAvailable: false });
    expect(brownie?.optionGroups[0]?.options[0]).toMatchObject({
      name: "Dondurma",
      priceDeltaKurus: 4000,
    });
  });

  it("returns 404 for an unknown or inactive table", async () => {
    const { table } = await createMenuCafe({ tableActive: false });
    for (const token of [table.qrToken, generateQrToken()]) {
      const res = await getMenu(token);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    }
  });

  it("returns CAFE_INACTIVE with the café name for an inactive café", async () => {
    const { cafe, table } = await createMenuCafe({ cafeActive: false });
    const res = await getMenu(table.qrToken);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: { code: "CAFE_INACTIVE", details: { cafeName: cafe.name } },
    });
  });

  it("rejects a malformed token without querying", async () => {
    const res = await getMenu("short");
    expect(res.statusCode).toBe(400);
  });
});
