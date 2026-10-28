import {
  MAX_CART_LINES,
  MAX_ITEM_QUANTITY,
  priceLine,
  type LinePricingError,
  type MenuProduct,
  type MenuResponse,
  type SelectedOption,
} from "@siparis/shared";
import { z } from "zod";

// The guest's cart for one table. It holds no prices: lines are priced against the current
// menu with the shared priceLine, exactly like the server does at checkout.

export const cartLineSchema = z.object({
  key: z.string(),
  productId: z.string(),
  quantity: z.int().min(1).max(MAX_ITEM_QUANTITY),
  optionIds: z.array(z.string()),
  note: z.string(),
});
export const cartStateSchema = z.object({
  lines: z.array(cartLineSchema).max(MAX_CART_LINES),
  note: z.string(),
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type CartState = z.infer<typeof cartStateSchema>;
export type NewCartLine = Omit<CartLine, "key">;

export type CartAction =
  | { type: "add"; line: NewCartLine }
  | { type: "replace"; key: string; line: NewCartLine }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "setNote"; note: string }
  | { type: "clear" };

export const emptyCart: CartState = { lines: [], note: "" };

/** localStorage key of a table's cart. */
export const cartStorageKey = (qrToken: string) => `siparis.cart.${qrToken}`;

let keyCounter = 0;
const newKey = () => `${Date.now().toString(36)}-${(++keyCounter).toString(36)}`;

const clampQuantity = (quantity: number) => Math.min(MAX_ITEM_QUANTITY, Math.max(1, quantity));

/** Lines with the same product, options and note are the same thing ordered more than once. */
function sameItem(a: NewCartLine, b: NewCartLine): boolean {
  const options = (line: NewCartLine) => [...line.optionIds].sort().join(",");
  return (
    a.productId === b.productId && a.note.trim() === b.note.trim() && options(a) === options(b)
  );
}

/** Adds a line, merging it into an identical one if there is one. */
function addLine(lines: CartLine[], line: NewCartLine, at = lines.length): CartLine[] {
  const existing = lines.find((l) => sameItem(l, line));
  if (existing) {
    return lines.map((l) =>
      l === existing ? { ...l, quantity: clampQuantity(l.quantity + line.quantity) } : l,
    );
  }
  if (lines.length >= MAX_CART_LINES) return lines;
  const added = { ...line, quantity: clampQuantity(line.quantity), key: newKey() };
  return [...lines.slice(0, at), added, ...lines.slice(at)];
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add":
      return { ...state, lines: addLine(state.lines, action.line) };
    case "replace": {
      const index = state.lines.findIndex((l) => l.key === action.key);
      if (index === -1) return state;
      const rest = state.lines.filter((l) => l.key !== action.key);
      return { ...state, lines: addLine(rest, action.line, index) };
    }
    case "setQuantity":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.key === action.key ? { ...l, quantity: clampQuantity(action.quantity) } : l,
        ),
      };
    case "remove":
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
    case "setNote":
      return { ...state, note: action.note };
    case "clear":
      return emptyCart;
  }
}

export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return emptyCart;
  try {
    const parsed = cartStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyCart;
  } catch {
    return emptyCart;
  }
}

// --- Pricing against the menu ---

export type PricedCartLine =
  | {
      line: CartLine;
      product: MenuProduct;
      ok: true;
      unitPriceKurus: number;
      totalKurus: number;
      selectedOptions: SelectedOption[];
    }
  | {
      line: CartLine;
      product: MenuProduct | undefined;
      ok: false;
      error: LinePricingError | { code: "PRODUCT_NOT_FOUND" };
    };

export type PricedCart = {
  lines: PricedCartLine[];
  /** Number of items (sum of quantities) across valid lines. */
  itemCount: number;
  totalKurus: number;
  hasInvalidLines: boolean;
};

export function priceCart(cart: CartState, menu: MenuResponse): PricedCart {
  const products = new Map(
    menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const)),
  );

  const lines = cart.lines.map((line): PricedCartLine => {
    const product = products.get(line.productId);
    if (!product) return { line, product, ok: false, error: { code: "PRODUCT_NOT_FOUND" } };
    const result = priceLine(product, line.optionIds);
    if (!result.ok) return { line, product, ok: false, error: result.error };
    return {
      line,
      product,
      ok: true,
      unitPriceKurus: result.unitPriceKurus,
      totalKurus: result.unitPriceKurus * line.quantity,
      selectedOptions: result.selectedOptions,
    };
  });

  const valid = lines.filter((l) => l.ok);
  return {
    lines,
    itemCount: valid.reduce((sum, l) => sum + l.line.quantity, 0),
    totalKurus: valid.reduce((sum, l) => sum + l.totalKurus, 0),
    hasInvalidLines: valid.length < lines.length,
  };
}
