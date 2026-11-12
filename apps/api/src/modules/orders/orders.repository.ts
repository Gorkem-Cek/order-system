import type { SelectedOption } from "@siparis/shared";
import type { PrismaClient } from "../../db";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";

const bySortOrder = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
const withItems = { items: { orderBy: { id: "asc" as const } } };

export type NewOrder = {
  cafeId: string;
  tableId: string | null;
  tableName: string;
  orderDate: Date;
  note: string | null;
  totalKurus: number;
  paymentRef: string;
  items: {
    productId: string;
    productName: string;
    unitPriceKurus: number;
    quantity: number;
    note: string | null;
    selectedOptions: SelectedOption[];
  }[];
};

/**
 * Creates the order with the next number of its café's day, inside the caller's transaction.
 * A per-café advisory lock serialises concurrent checkouts so two orders never share a number.
 */
export async function insertOrderWithNextNumber(tx: Prisma.TransactionClient, order: NewOrder) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.cafeId}))`;
  const { _max } = await tx.order.aggregate({
    where: { cafeId: order.cafeId, orderDate: order.orderDate },
    _max: { orderNumber: true },
  });
  const { items, ...data } = order;
  return tx.order.create({
    data: {
      ...data,
      orderNumber: (_max.orderNumber ?? 0) + 1,
      items: {
        create: items.map((item) => ({
          ...item,
          selectedOptions: item.selectedOptions as Prisma.InputJsonValue,
        })),
      },
    },
    include: withItems,
  });
}

export function createOrdersRepository(prisma: PrismaClient) {
  return {
    /** The café's non-deleted products with these ids, with options for pricing. */
    findProductsForCheckout(cafeId: string, productIds: string[]) {
      return prisma.product.findMany({
        where: { cafeId, id: { in: productIds }, deletedAt: null },
        include: {
          optionGroups: { orderBy: bySortOrder, include: { options: { orderBy: bySortOrder } } },
        },
      });
    },

    /** See insertOrderWithNextNumber. */
    createWithNextNumber(order: NewOrder) {
      return prisma.$transaction((tx) => insertOrderWithNextNumber(tx, order));
    },

    findById(cafeId: string, id: string) {
      return prisma.order.findFirst({ where: { id, cafeId }, include: withItems });
    },

    listByStatus(cafeId: string, statuses: OrderStatus[]) {
      return prisma.order.findMany({
        where: { cafeId, status: { in: statuses } },
        orderBy: { createdAt: "asc" },
        include: withItems,
      });
    },

    /** One page of the café's orders, newest first, with the total number of matches. */
    async listHistory(
      cafeId: string,
      filter: { from?: Date; to?: Date; status?: OrderStatus },
      page: { skip: number; take: number },
    ) {
      const where = {
        cafeId,
        ...(filter.status && { status: filter.status }),
        ...((filter.from || filter.to) && { orderDate: { gte: filter.from, lte: filter.to } }),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.order.findMany({
          where,
          orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }],
          include: withItems,
          ...page,
        }),
        prisma.order.count({ where }),
      ]);
      return { rows, total };
    },

    /** Changes the status only if it is still `from`; returns whether it did. */
    async updateStatusIf(cafeId: string, id: string, from: OrderStatus, to: OrderStatus) {
      const { count } = await prisma.order.updateMany({
        where: { id, cafeId, status: from },
        data: { status: to },
      });
      return count === 1;
    },
  };
}

export type OrdersRepository = ReturnType<typeof createOrdersRepository>;
