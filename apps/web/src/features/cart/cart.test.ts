import { MAX_ITEM_QUANTITY } from "@siparis/shared";
import { describe, expect, it } from "vitest";
import { ids, menuFixture } from "../../test/menu-fixture";
import { cartReducer, emptyCart, parseStoredCart, priceCart, type NewCartLine } from "./cart";

const latteLarge: NewCartLine = {
  productId: ids.latte,
  quantity: 1,
  optionIds: [ids.large, ids.shot],
  note: "",
};
const cay: NewCartLine = { productId: ids.cay, quantity: 2, optionIds: [], note: "" };

describe("cartReducer", () => {
  it("merges identical lines and keeps different ones apart", () => {
    let cart = cartReducer(emptyCart, { type: "add", line: latteLarge });
    cart = cartReducer(cart, {
      type: "add",
      line: { ...latteLarge, optionIds: [ids.shot, ids.large] },
    });
    cart = cartReducer(cart, { type: "add", line: { ...latteLarge, note: "Sıcak olsun" } });

    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]?.quantity).toBe(2);
    expect(cart.lines[1]?.note).toBe("Sıcak olsun");
  });

  it("caps quantities", () => {
    let cart = cartReducer(emptyCart, {
      type: "add",
      line: { ...cay, quantity: MAX_ITEM_QUANTITY },
    });
    cart = cartReducer(cart, { type: "add", line: cay });
    const key = cart.lines[0]?.key ?? "";
    expect(cart.lines[0]?.quantity).toBe(MAX_ITEM_QUANTITY);
    expect(cartReducer(cart, { type: "setQuantity", key, quantity: 0 }).lines[0]?.quantity).toBe(1);
  });

  it("replaces a line in place when it is edited", () => {
    let cart = cartReducer(emptyCart, { type: "add", line: latteLarge });
    cart = cartReducer(cart, { type: "add", line: cay });
    const key = cart.lines[0]?.key ?? "";
    cart = cartReducer(cart, {
      type: "replace",
      key,
      line: { ...latteLarge, optionIds: [ids.small] },
    });
    expect(cart.lines.map((l) => l.optionIds)).toEqual([[ids.small], []]);
  });

  it("removes lines, sets the note and clears", () => {
    let cart = cartReducer(emptyCart, { type: "add", line: cay });
    cart = cartReducer(cart, { type: "setNote", note: "Hepsi birlikte" });
    expect(cart.note).toBe("Hepsi birlikte");
    expect(cartReducer(cart, { type: "remove", key: cart.lines[0]?.key ?? "" }).lines).toEqual([]);
    expect(cartReducer(cart, { type: "clear" })).toEqual(emptyCart);
  });
});

describe("parseStoredCart", () => {
  it("restores a saved cart and ignores anything malformed", () => {
    const cart = cartReducer(emptyCart, { type: "add", line: cay });
    expect(parseStoredCart(JSON.stringify(cart))).toEqual(cart);
    expect(parseStoredCart("{not json")).toEqual(emptyCart);
    expect(parseStoredCart(JSON.stringify({ lines: [{ quantity: -1 }] }))).toEqual(emptyCart);
    expect(parseStoredCart(null)).toEqual(emptyCart);
  });
});

describe("priceCart", () => {
  it("prices lines with options and totals the valid ones", () => {
    let cart = cartReducer(emptyCart, { type: "add", line: latteLarge });
    cart = cartReducer(cart, { type: "add", line: cay });
    const priced = priceCart(cart, menuFixture);

    expect(priced.lines[0]).toMatchObject({ ok: true, unitPriceKurus: 16000 + 4000 + 3500 });
    expect(priced.itemCount).toBe(3);
    expect(priced.totalKurus).toBe(23500 + 2 * 4000);
    expect(priced.hasInvalidLines).toBe(false);
  });

  it("flags lines whose product is gone, sold out or no longer valid", () => {
    let cart = cartReducer(emptyCart, { type: "add", line: cay });
    cart = cartReducer(cart, { type: "add", line: { ...cay, productId: ids.brownie } });
    cart = cartReducer(cart, {
      type: "add",
      line: { ...cay, productId: "cmgone0000000000000000001" },
    });
    cart = cartReducer(cart, { type: "add", line: { ...latteLarge, optionIds: [ids.shot] } });
    const priced = priceCart(cart, menuFixture);

    expect(priced.lines.map((l) => (l.ok ? "ok" : l.error.code))).toEqual([
      "ok",
      "PRODUCT_UNAVAILABLE",
      "PRODUCT_NOT_FOUND",
      "TOO_FEW_OPTIONS",
    ]);
    expect(priced.totalKurus).toBe(2 * 4000);
    expect(priced.hasInvalidLines).toBe(true);
  });
});
