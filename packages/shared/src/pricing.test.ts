import { describe, expect, it } from "vitest";
import { priceLine, type PricedProduct } from "./pricing";

// Ids only need to be distinct here; the pricing logic never checks their format.
const latte: PricedProduct = {
  priceKurus: 16000,
  isAvailable: true,
  optionGroups: [
    {
      id: "size",
      name: "Boyut",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "small", name: "Küçük", priceDeltaKurus: 0, isAvailable: true },
        { id: "large", name: "Büyük", priceDeltaKurus: 4000, isAvailable: true },
      ],
    },
    {
      id: "extras",
      name: "Ekstralar",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "shot", name: "Ekstra shot", priceDeltaKurus: 3500, isAvailable: true },
        { id: "vanilla", name: "Vanilya şurubu", priceDeltaKurus: 2000, isAvailable: true },
        { id: "caramel", name: "Karamel şurubu", priceDeltaKurus: 2000, isAvailable: false },
      ],
    },
  ],
};

describe("priceLine", () => {
  it("adds option deltas to the base price", () => {
    expect(priceLine(latte, ["large", "shot", "vanilla"])).toEqual({
      ok: true,
      unitPriceKurus: 16000 + 4000 + 3500 + 2000,
      selectedOptions: [
        { group: "Boyut", option: "Büyük", priceDeltaKurus: 4000 },
        { group: "Ekstralar", option: "Ekstra shot", priceDeltaKurus: 3500 },
        { group: "Ekstralar", option: "Vanilya şurubu", priceDeltaKurus: 2000 },
      ],
    });
  });

  it("returns snapshots in menu order regardless of selection order", () => {
    const result = priceLine(latte, ["vanilla", "small", "shot"]);
    expect(result.ok && result.selectedOptions.map((o) => o.option)).toEqual([
      "Küçük",
      "Ekstra shot",
      "Vanilya şurubu",
    ]);
  });

  it("prices a product without option groups at its base price", () => {
    expect(priceLine({ priceKurus: 4000, isAvailable: true, optionGroups: [] }, [])).toEqual({
      ok: true,
      unitPriceKurus: 4000,
      selectedOptions: [],
    });
  });

  it("rejects an unavailable product", () => {
    expect(priceLine({ ...latte, isAvailable: false }, ["small"])).toEqual({
      ok: false,
      error: { code: "PRODUCT_UNAVAILABLE" },
    });
  });

  it("requires the minimum number of options in a group", () => {
    expect(priceLine(latte, ["shot"])).toEqual({
      ok: false,
      error: { code: "TOO_FEW_OPTIONS", groupId: "size", min: 1 },
    });
  });

  it("rejects more options than a group allows", () => {
    expect(priceLine(latte, ["small", "large"])).toEqual({
      ok: false,
      error: { code: "TOO_MANY_OPTIONS", groupId: "size", max: 1 },
    });
  });

  it("rejects an unavailable option", () => {
    expect(priceLine(latte, ["small", "caramel"])).toEqual({
      ok: false,
      error: { code: "OPTION_UNAVAILABLE", optionId: "caramel" },
    });
  });

  it("rejects an option that belongs to another product", () => {
    expect(priceLine(latte, ["small", "not-latte"])).toEqual({
      ok: false,
      error: { code: "UNKNOWN_OPTION", optionId: "not-latte" },
    });
  });

  it("rejects the same option twice instead of charging it twice", () => {
    expect(priceLine(latte, ["small", "shot", "shot"])).toEqual({
      ok: false,
      error: { code: "DUPLICATE_OPTION", optionId: "shot" },
    });
  });
});
