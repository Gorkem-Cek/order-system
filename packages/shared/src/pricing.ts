import { z } from "zod";
import type { MenuProduct } from "./menu";

// Pricing of one cart line. Used by the web cart for display and by the API at checkout,
// where it runs on products loaded from the database (client prices are never trusted).

/** Snapshot of a chosen option, stored on order items. */
export const selectedOptionSchema = z.object({
  group: z.string(),
  option: z.string(),
  priceDeltaKurus: z.int().nonnegative(),
});
export type SelectedOption = z.infer<typeof selectedOptionSchema>;

/** The parts of a product that pricing needs. */
export type PricedProduct = Pick<MenuProduct, "priceKurus" | "isAvailable" | "optionGroups">;

export type LinePricingError =
  | { code: "PRODUCT_UNAVAILABLE" }
  | { code: "DUPLICATE_OPTION"; optionId: string }
  | { code: "UNKNOWN_OPTION"; optionId: string }
  | { code: "OPTION_UNAVAILABLE"; optionId: string }
  | { code: "TOO_FEW_OPTIONS"; groupId: string; min: number }
  | { code: "TOO_MANY_OPTIONS"; groupId: string; max: number };

export type LinePricingResult =
  | { ok: true; unitPriceKurus: number; selectedOptions: SelectedOption[] }
  | { ok: false; error: LinePricingError };

/**
 * Validates the chosen options against the product's option groups and returns the unit
 * price (base price + option deltas). Selected options come back in menu order.
 */
export function priceLine(product: PricedProduct, optionIds: readonly string[]): LinePricingResult {
  if (!product.isAvailable) return { ok: false, error: { code: "PRODUCT_UNAVAILABLE" } };

  const chosen = new Set<string>();
  for (const optionId of optionIds) {
    if (chosen.has(optionId)) return { ok: false, error: { code: "DUPLICATE_OPTION", optionId } };
    chosen.add(optionId);
  }

  const known = new Set(product.optionGroups.flatMap((g) => g.options.map((o) => o.id)));
  for (const optionId of chosen) {
    if (!known.has(optionId)) return { ok: false, error: { code: "UNKNOWN_OPTION", optionId } };
  }

  let unitPriceKurus = product.priceKurus;
  const selectedOptions: SelectedOption[] = [];

  for (const group of product.optionGroups) {
    const picked = group.options.filter((option) => chosen.has(option.id));
    if (picked.length < group.minSelect) {
      return {
        ok: false,
        error: { code: "TOO_FEW_OPTIONS", groupId: group.id, min: group.minSelect },
      };
    }
    if (picked.length > group.maxSelect) {
      return {
        ok: false,
        error: { code: "TOO_MANY_OPTIONS", groupId: group.id, max: group.maxSelect },
      };
    }
    for (const option of picked) {
      if (!option.isAvailable) {
        return { ok: false, error: { code: "OPTION_UNAVAILABLE", optionId: option.id } };
      }
      unitPriceKurus += option.priceDeltaKurus;
      selectedOptions.push({
        group: group.name,
        option: option.name,
        priceDeltaKurus: option.priceDeltaKurus,
      });
    }
  }

  return { ok: true, unitPriceKurus, selectedOptions };
}
