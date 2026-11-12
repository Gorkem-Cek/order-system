import type { MenuCategory, MenuProduct, MenuResponse, PaymentMethod } from "@siparis/shared";
import { AppError, notFound } from "../../lib/errors";
import type { MenuRepository } from "./menu.repository";

type CafePaymentKeys = {
  iyzicoMode: "SANDBOX" | "LIVE" | null;
  iyzicoApiKey: string | null;
  iyzicoSecretKey: string | null;
};

type CategoryRow = Awaited<ReturnType<MenuRepository["findMenu"]>>[number];
export type ProductRow = CategoryRow["products"][number];

export function toMenuProduct(product: ProductRow): MenuProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceKurus: product.priceKurus,
    imageUrl: product.imageUrl,
    isAvailable: product.isAvailable,
    optionGroups: product.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDeltaKurus: option.priceDeltaKurus,
        isAvailable: option.isAvailable,
      })),
    })),
  };
}

export function toMenuCategory(category: CategoryRow): MenuCategory {
  return { id: category.id, name: category.name, products: category.products.map(toMenuProduct) };
}

export function createMenuService(deps: {
  menu: MenuRepository;
  /** Whether a café's iyzico account is usable. */
  acceptsIyzico: (cafe: CafePaymentKeys) => boolean;
  allowMockPayments: boolean;
}) {
  const { menu } = deps;

  return {
    /** iyzico once the café's account is connected; otherwise the fake card, where allowed. */
    paymentMethodFor(cafe: CafePaymentKeys): PaymentMethod {
      if (deps.acceptsIyzico(cafe)) return "iyzico";
      return deps.allowMockPayments ? "mock" : "none";
    },

    /** Resolves a table's QR token to its active café and table. */
    async resolveTable(qrToken: string) {
      const table = await menu.findTableByQrToken(qrToken);
      if (!table || !table.isActive) throw notFound("Table");
      if (!table.cafe.isActive) {
        throw new AppError(403, "CAFE_INACTIVE", "Café is inactive", {
          cafeName: table.cafe.name,
        });
      }
      return table;
    },

    async getMenu(qrToken: string): Promise<MenuResponse> {
      const table = await this.resolveTable(qrToken);
      const categories = (await menu.findMenu(table.cafeId))
        .map(toMenuCategory)
        .filter((category) => category.products.length > 0);

      const { cafe } = table;
      return {
        cafe: {
          name: cafe.name,
          slug: cafe.slug,
          logoUrl: cafe.logoUrl,
          coverUrl: cafe.coverUrl,
          primaryColor: cafe.primaryColor,
        },
        table: { name: table.name },
        paymentMethod: this.paymentMethodFor(cafe),
        categories,
      };
    },
  };
}

export type MenuService = ReturnType<typeof createMenuService>;
