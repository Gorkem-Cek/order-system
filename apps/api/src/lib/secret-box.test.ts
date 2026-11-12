import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSecretBox, parseSecretKey } from "./secret-box";

describe("secret box", () => {
  const box = createSecretBox(randomBytes(32));

  it("round-trips a secret without storing it in readable form", () => {
    const sealed = box.seal("sandbox-secret-ŞĞÜ");
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("sandbox-secret");
    expect(box.open(sealed)).toBe("sandbox-secret-ŞĞÜ");
  });

  it("produces a different value each time", () => {
    expect(box.seal("same")).not.toBe(box.seal("same"));
  });

  it("rejects altered values and values sealed with another key", () => {
    const sealed = box.seal("secret");
    const parts = sealed.split(".");
    const tampered = [...parts.slice(0, 3), Buffer.from("other").toString("base64url")].join(".");
    expect(() => box.open(tampered)).toThrow();
    expect(() => createSecretBox(randomBytes(32)).open(sealed)).toThrow();
    expect(() => box.open("not sealed")).toThrow();
  });

  it("accepts only 32-byte keys", () => {
    expect(parseSecretKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => parseSecretKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
