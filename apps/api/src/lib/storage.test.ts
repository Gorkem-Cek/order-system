import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createLocalStorage, isValidKey, newImageKey } from "./storage";

describe("storage keys", () => {
  it("accepts generated keys and refuses anything that could escape the folder", () => {
    expect(isValidKey(newImageKey("cafes/abc/products", "xyz"))).toBe(true);
    for (const key of [
      "../secret.webp",
      "a/../../b.webp",
      "/etc/passwd",
      "a\\b.webp",
      "x.png",
      "x.webp/..",
    ]) {
      expect(isValidKey(key), key).toBe(false);
    }
  });
});

describe("local storage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "siparis-storage-"));
  const storage = createLocalStorage(dir);
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("stores, opens and removes files", async () => {
    const url = await storage.put("cafes/c1/products/p1-abc.webp", Buffer.from("data"));
    expect(url).toBe("/uploads/cafes/c1/products/p1-abc.webp");
    expect(await readFile(path.join(dir, "cafes", "c1", "products", "p1-abc.webp"), "utf8")).toBe(
      "data",
    );

    const opened = await storage.open("cafes/c1/products/p1-abc.webp");
    expect(opened?.size).toBe(4);
    opened?.stream.destroy();

    await storage.removeByUrl(url);
    expect(await storage.open("cafes/c1/products/p1-abc.webp")).toBeNull();
  });

  it("ignores unknown URLs and refuses bad keys", async () => {
    await expect(storage.removeByUrl("https://example.com/x.webp")).resolves.toBeUndefined();
    await expect(storage.removeByUrl("/uploads/../x.webp")).resolves.toBeUndefined();
    expect(await storage.open("../x.webp")).toBeNull();
    await expect(storage.put("../x.webp", Buffer.from(""))).rejects.toThrow();
  });
});
