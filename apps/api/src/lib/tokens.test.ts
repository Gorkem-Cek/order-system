import { describe, expect, it } from "vitest";
import { generateQrToken } from "./tokens";

describe("generateQrToken", () => {
  it("returns a 22-character URL-safe token", () => {
    expect(generateQrToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("returns a different token each time", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateQrToken));
    expect(tokens.size).toBe(100);
  });
});
