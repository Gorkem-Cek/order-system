import type { OptionGroupInput, ProductInput } from "@siparis/shared";
import type { PrismaClient } from "../../db";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const bySortOrder = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
const productInclude = {
  optionGroups: { orderBy: bySortOrder, include: { options: { orderBy: bySortOrder } } },
};

/**
 * Makes a product's option groups match `groups`: rows whose id is given (and belongs to this
 * product) are updated in place, others are created, and missing ones are deleted. Keeping
 * ids means guests' open carts stay valid when staff edit a price or a name.
 */
async function syncOptionGroups(tx: Tx, productId: string, groups: OptionGroupInput[]) {
  const existing = await tx.optionGroup.findMany({
    where: { productId },
    include: { options: { select: { id: true } } },
  });
  const existingGroups = new Map(existing.map((g) => [g.id, g]));
  const keptGroupIds = groups.flatMap((g) => (g.id && existingGroups.has(g.id) ? [g.id] : []));
  await tx.optionGroup.deleteMany({ where: { productId, id: { notIn: keptGroupIds } } });

  for (const [groupIndex, group] of groups.entries()) {
    const data = {
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      sortOrder: groupIndex,
    };
    const current = group.id ? existingGroups.get(group.id) : undefined;
    if (!current) {
      await tx.optionGroup.create({
        data: {
          ...data,
          productId,
          options: {
            // A new group gets new options, even if the client sent ids.
            create: group.options.map((option, sortOrder) => ({
              name: option.name,
              priceDeltaKurus: option.priceDeltaKurus,
              isAvailable: option.isAvailable,
              sortOrder,
            })),
          },
        },
      });
      continue;
    }

    await tx.optionGroup.update({ where: { id: current.id }, data });
    const existingOptionIds = new Set(current.options.map((o) => o.id));
    const keptOptionIds = group.options.flatMap((o) =>
      o.id && existingOptionIds.has(o.id) ? [o.id] : [],
    );
    await tx.option.deleteMany({
      where: { optionGroupId: current.id, id: { notIn: keptOptionIds } },
    });
    for (const [sortOrder, { id, ...option }] of group.options.entries()) {
      if (id && existingOptionIds.has(id)) {
        await tx.option.update({ where: { id }, data: { ...option, sortOrder } });
      } else {
        await tx.option.create({ data: { ...option, sortOrder, optionGroupId: current.id } });
      }
    }
  }
}

/** Sets sortOrder 0..n-1 following `ids`. */
async function applyOrder(
  ids: string[],
  update: (id: string, sortOrder: number) => Promise<unknown>,
) {
  for (const [sortOrder, id] of ids.entries()) await update(id, sortOrder);
}

export function createStaffMenuRepository(prisma: PrismaClient) {
  const nextSortOrder = async (tx: Tx, where: { cafeId: string; categoryId?: string }) => {
    const { _max } = await (where.categoryId
      ? tx.product.aggregate({ where: { ...where, deletedAt: null }, _max: { sortOrder: true } })
      : tx.category.aggregate({ where, _max: { sortOrder: true } }));
    return (_max.sortOrder ?? -1) + 1;
  };

  return {
    findCategory(cafeId: string, id: string) {
      return prisma.category.findFirst({ where: { id, cafeId } });
    },

    createCategory(cafeId: string, name: string) {
      return prisma.$transaction(async (tx) =>
        tx.category.create({
          data: { cafeId, name, sortOrder: await nextSortOrder(tx, { cafeId }) },
        }),
      );
    },

    renameCategory(id: string, name: string) {
      return prisma.category.update({ where: { id }, data: { name } });
    },

    countLiveProducts(categoryId: string) {
      return prisma.product.count({ where: { categoryId, deletedAt: null } });
    },

    /** Deletes an empty category together with its already-deleted products. */
    deleteCategory(id: string) {
      return prisma.$transaction([
        // Order items keep their snapshots; their productId is set to null.
        prisma.product.deleteMany({ where: { categoryId: id, deletedAt: { not: null } } }),
        prisma.category.delete({ where: { id } }),
      ]);
    },

    categoryIds(cafeId: string) {
      return prisma.category
        .findMany({ where: { cafeId }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));
    },

    reorderCategories(ids: string[]) {
      return prisma.$transaction(async (tx) =>
        applyOrder(ids, (id, sortOrder) =>
          tx.category.update({ where: { id }, data: { sortOrder } }),
        ),
      );
    },

    liveProductIds(categoryId: string) {
      return prisma.product
        .findMany({ where: { categoryId, deletedAt: null }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));
    },

    reorderProducts(ids: string[]) {
      return prisma.$transaction(async (tx) =>
        applyOrder(ids, (id, sortOrder) =>
          tx.product.update({ where: { id }, data: { sortOrder } }),
        ),
      );
    },

    /** A non-deleted product of the café, with its options. */
    findProduct(cafeId: string, id: string) {
      return prisma.product.findFirst({
        where: { id, cafeId, deletedAt: null },
        include: productInclude,
      });
    },

    createProduct(cafeId: string, input: ProductInput) {
      return prisma.$transaction(async (tx) => {
        const { optionGroups, ...data } = input;
        const product = await tx.product.create({
          data: {
            ...data,
            cafeId,
            sortOrder: await nextSortOrder(tx, { cafeId, categoryId: input.categoryId }),
          },
        });
        await syncOptionGroups(tx, product.id, optionGroups);
        return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
      });
    },

    updateProduct(cafeId: string, id: string, input: ProductInput, movedCategory: boolean) {
      return prisma.$transaction(async (tx) => {
        const { optionGroups, ...data } = input;
        await tx.product.update({
          where: { id },
          data: {
            ...data,
            // A product moved to another category goes to the end of it.
            ...(movedCategory && {
              sortOrder: await nextSortOrder(tx, { cafeId, categoryId: input.categoryId }),
            }),
          },
        });
        await syncOptionGroups(tx, id, optionGroups);
        return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
      });
    },

    setAvailability(id: string, isAvailable: boolean) {
      return prisma.product.update({
        where: { id },
        data: { isAvailable },
        include: productInclude,
      });
    },

    setImageUrl(id: string, imageUrl: string | null) {
      return prisma.product.update({ where: { id }, data: { imageUrl }, include: productInclude });
    },

    softDeleteProduct(id: string, at: Date) {
      return prisma.product.update({ where: { id }, data: { deletedAt: at } });
    },
  };
}

export type StaffMenuRepository = ReturnType<typeof createStaffMenuRepository>;
