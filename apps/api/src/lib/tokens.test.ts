import { describe, expect, it } from "vitest";
import { generateQrToken, generateSessionToken, hashToken } from "./tokens";

describe("session tokens", () => {
  it("generates 43-character URL-safe tokens", () => {
    expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically to hex without exposing the token", () => {
    const token = generateSessionToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("generateQrToken", () => {
  it("returns a 22-character URL-safe token", () => {
    expect(generateQrToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("returns a different token each time", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateQrToken));
    expect(tokens.size).toBe(100);
  });
});
