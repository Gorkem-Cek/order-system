// Integration tests for database constraints. They need a migrated database (DATABASE_URL)
// and only touch cafés whose slug starts with a random test prefix.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "./db";
import { generateQrToken } from "./lib/tokens";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("database constraints", () => {
  const prisma = createPrismaClient(databaseUrl ?? "");
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  let counter = 0;

  afterAll(async () => {
    await prisma.cafe.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  async function createCafeWithOrder() {
    const cafe = await prisma.cafe.create({
      data: { name: "Test Kafe", slug: `${prefix}-${++counter}` },
    });
    const table = await prisma.table.create({
      data: { cafeId: cafe.id, name: "Masa 1", qrToken: generateQrToken() },
    });
    const category = await prisma.category.create({ data: { cafeId: cafe.id, name: "İçecekler" } });
    const product = await prisma.product.create({
      data: {
        cafeId: cafe.id,
        categoryId: category.id,
        name: "Latte",
        priceKurus: 16000,
        optionGroups: {
          create: {
            name: "Boyut",
            minSelect: 1,
            maxSelect: 1,
            options: { create: { name: "Büyük", priceDeltaKurus: 4000 } },
          },
        },
      },
    });
    const order = await prisma.order.create({
      data: {
        cafeId: cafe.id,
        tableId: table.id,
        tableName: table.name,
        orderNumber: 1,
        orderDate: new Date("2026-10-28"),
        totalKurus: 20000,
        paymentRef: "mock_1",
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            unitPriceKurus: 20000,
            quantity: 1,
            selectedOptions: [{ group: "Boyut", option: "Büyük", priceDeltaKurus: 4000 }],
          },
        },
      },
    });
    return { cafe, table, category, product, order };
  }

  it("deleting a café removes all of its data", async () => {
    const { cafe, order } = await createCafeWithOrder();
    await prisma.cafe.delete({ where: { id: cafe.id } });

    expect(await prisma.table.count({ where: { cafeId: cafe.id } })).toBe(0);
    expect(await prisma.product.count({ where: { cafeId: cafe.id } })).toBe(0);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("deleting a table keeps its orders with the table name snapshot", async () => {
    const { table, order } = await createCafeWithOrder();
    await prisma.table.delete({ where: { id: table.id } });

    const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(kept.tableId).toBeNull();
    expect(kept.tableName).toBe("Masa 1");
  });

  it("deleting a product keeps order items with their snapshot", async () => {
    const { product, order } = await createCafeWithOrder();
    await prisma.product.delete({ where: { id: product.id } });

    const [item] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(item).toMatchObject({ productId: null, productName: "Latte", unitPriceKurus: 20000 });
  });

  it("a category with products can't be deleted", async () => {
    const { category } = await createCafeWithOrder();
    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toThrow();
  });

  it("order numbers are unique per café per day", async () => {
    const { cafe, order } = await createCafeWithOrder();
    const duplicate = { ...order, id: undefined, createdAt: undefined, updatedAt: undefined };
    await expect(prisma.order.create({ data: duplicate })).rejects.toThrow();
    await expect(
      prisma.order.create({ data: { ...duplicate, orderDate: new Date("2026-10-29") } }),
    ).resolves.toMatchObject({ cafeId: cafe.id, orderNumber: 1 });
  });

  it("QR tokens and café slugs are unique", async () => {
    const { cafe, table } = await createCafeWithOrder();
    await expect(
      prisma.table.create({ data: { cafeId: cafe.id, name: "Masa 2", qrToken: table.qrToken } }),
    ).rejects.toThrow();
    await expect(
      prisma.cafe.create({ data: { name: "Kopya", slug: cafe.slug } }),
    ).rejects.toThrow();
  });
});
