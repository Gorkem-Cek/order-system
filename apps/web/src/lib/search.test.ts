import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeForSearch } from "./search";

describe("normalizeForSearch", () => {
  it("folds Turkish letters and case", () => {
    expect(normalizeForSearch("ÇAY")).toBe("cay");
    expect(normalizeForSearch("Sıcak Çikolata")).toBe("sicak cikolata");
    expect(normalizeForSearch("İÇECEKLER")).toBe("icecekler");
    expect(normalizeForSearch("Şeker  Ğ Ö Ü")).toBe("seker g o u");
  });

  it("removes other accents", () => {
    expect(normalizeForSearch("Crème brûlée")).toBe("creme brulee");
  });
});

describe("matchesSearch", () => {
  it("matches any field, ignoring Turkish letters", () => {
    expect(matchesSearch("cay", "Çay")).toBe(true);
    expect(matchesSearch("lokum", "Türk Kahvesi", "Lokum ile servis edilir.")).toBe(true);
    expect(matchesSearch("latte", "Çay", null)).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesSearch("   ", "Çay")).toBe(true);
  });
});
