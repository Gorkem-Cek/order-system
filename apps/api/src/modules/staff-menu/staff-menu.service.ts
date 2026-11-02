import type { MenuCategory, MenuProduct, ProductInput } from "@siparis/shared";
import { AppError, notFound } from "../../lib/errors";
import type { MenuRepository } from "../menu/menu.repository";
import { toMenuCategory, toMenuProduct } from "../menu/menu.service";
import type { StaffMenuRepository } from "./staff-menu.repository";

/** `ids` must be exactly the expected set, just in a new order. */
function assertSameIds(ids: string[], expected: string[]) {
  const wanted = new Set(expected);
  if (ids.length !== wanted.size || !ids.every((id) => wanted.has(id))) {
    throw new AppError(400, "VALIDATION_FAILED", "The list must contain every item exactly once");
  }
}

export function createStaffMenuService(deps: {
  staffMenu: StaffMenuRepository;
  menu: MenuRepository;
  now?: () => Date;
}) {
  const { staffMenu, menu } = deps;
  const now = deps.now ?? (() => new Date());

  const categoryOf = async (cafeId: string, id: string) => {
    const category = await staffMenu.findCategory(cafeId, id);
    if (!category) throw notFound("Category");
    return category;
  };
  const productOf = async (cafeId: string, id: string) => {
    const product = await staffMenu.findProduct(cafeId, id);
    if (!product) throw notFound("Product");
    return product;
  };

  return {
    /** The whole menu, including empty categories. */
    async getMenu(cafeId: string): Promise<MenuCategory[]> {
      return (await menu.findMenu(cafeId)).map(toMenuCategory);
    },

    // --- Categories ---

    async createCategory(cafeId: string, name: string): Promise<MenuCategory> {
      const category = await staffMenu.createCategory(cafeId, name);
      return { id: category.id, name: category.name, products: [] };
    },

    async renameCategory(cafeId: string, id: string, name: string): Promise<void> {
      await categoryOf(cafeId, id);
      await staffMenu.renameCategory(id, name);
    },

    /** Only empty categories can be deleted, so no product disappears by accident. */
    async deleteCategory(cafeId: string, id: string): Promise<void> {
      await categoryOf(cafeId, id);
      if ((await staffMenu.countLiveProducts(id)) > 0) {
        throw new AppError(409, "CONFLICT", "Category still has products", {
          reason: "CATEGORY_NOT_EMPTY",
        });
      }
      await staffMenu.deleteCategory(id);
    },

    async reorderCategories(cafeId: string, ids: string[]): Promise<void> {
      assertSameIds(ids, await staffMenu.categoryIds(cafeId));
      await staffMenu.reorderCategories(ids);
    },

    async reorderProducts(cafeId: string, categoryId: string, ids: string[]): Promise<void> {
      await categoryOf(cafeId, categoryId);
      assertSameIds(ids, await staffMenu.liveProductIds(categoryId));
      await staffMenu.reorderProducts(ids);
    },

    // --- Products ---

    async createProduct(cafeId: string, input: ProductInput): Promise<MenuProduct> {
      await categoryOf(cafeId, input.categoryId);
      return toMenuProduct(await staffMenu.createProduct(cafeId, input));
    },

    async updateProduct(cafeId: string, id: string, input: ProductInput): Promise<MenuProduct> {
      const product = await productOf(cafeId, id);
      await categoryOf(cafeId, input.categoryId);
      const moved = product.categoryId !== input.categoryId;
      return toMenuProduct(await staffMenu.updateProduct(cafeId, id, input, moved));
    },

    async setAvailability(cafeId: string, id: string, isAvailable: boolean): Promise<MenuProduct> {
      await productOf(cafeId, id);
      return toMenuProduct(await staffMenu.setAvailability(id, isAvailable));
    },

    /** Soft delete: the product leaves the menu but past orders keep pointing at it. */
    async deleteProduct(cafeId: string, id: string): Promise<void> {
      await productOf(cafeId, id);
      await staffMenu.softDeleteProduct(id, now());
    },
  };
}

export type StaffMenuService = ReturnType<typeof createStaffMenuService>;
