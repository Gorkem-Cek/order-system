import type { PrismaClient } from "../../db";

const bySortOrder = [{ sortOrder: "asc" as const }, { id: "asc" as const }];

export function createMenuRepository(prisma: PrismaClient) {
  return {
    findTableByQrToken(qrToken: string) {
      return prisma.table.findUnique({ where: { qrToken }, include: { cafe: true } });
    },

    /** Categories with their non-deleted products, option groups and options, in menu order. */
    findMenu(cafeId: string) {
      return prisma.category.findMany({
        where: { cafeId },
        orderBy: bySortOrder,
        include: {
          products: {
            where: { deletedAt: null },
            orderBy: bySortOrder,
            include: {
              optionGroups: {
                orderBy: bySortOrder,
                include: { options: { orderBy: bySortOrder } },
              },
            },
          },
        },
      });
    },
  };
}

export type MenuRepository = ReturnType<typeof createMenuRepository>;
