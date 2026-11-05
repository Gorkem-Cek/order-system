import { cafeSlugSchema } from "@siparis/shared";
import { describe, expect, it } from "vitest";
import { generatePassword, slugify } from "./generate";

describe("slugify", () => {
  it("turns Turkish café names into valid slugs", () => {
    expect(slugify("Köşe Kahve & Çay")).toBe("kose-kahve-cay");
    expect(slugify("  İSTANBUL Ğüzel Iğdır  ")).toBe("istanbul-guzel-igdir");
    expect(slugify("Café Noir – 2")).toBe("cafe-noir-2");
    expect(slugify("!!!")).toBe("");
  });

  it("stays within the slug length without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(49)} b`);
    expect(slug).toBe("a".repeat(49));
    expect(cafeSlugSchema.safeParse(slugify("Uzun ".repeat(20))).success).toBe(true);
  });
});

describe("generatePassword", () => {
  it("makes distinct 12-character passwords without look-alike characters", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(passwords.size).toBe(50);
    for (const p of passwords)
      expect(p).toMatch(/^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ2-9]{12}$/);
  });
});
