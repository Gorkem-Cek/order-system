import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../test/helpers";

const INDEX = "<!doctype html><title>Siparİş</title>";
const SCRIPT = "console.log('app');";

describe.skipIf(!hasDatabase)("serving the web app", () => {
  const webDir = mkdtempSync(path.join(tmpdir(), "siparis-web-"));
  mkdirSync(path.join(webDir, "assets"));
  writeFileSync(path.join(webDir, "index.html"), INDEX);
  writeFileSync(path.join(webDir, "assets", "app-abc123.js"), SCRIPT);
  writeFileSync(path.join(webDir, "assets", "app-abc123.js.gz"), gzipSync(SCRIPT));

  const ctx = createTestContext({ WEB_DIR: webDir });
  afterAll(async () => {
    await ctx.cleanup();
    rmSync(webDir, { recursive: true, force: true });
  });
  const get = (url: string, headers: Record<string, string> = {}) =>
    ctx.app.inject({ method: "GET", url, headers });

  it("serves the app for page addresses, without caching it", async () => {
    for (const url of ["/", "/m/cXH3lRxGbr1b6EYzjSvBMg", "/staff/tables/print?table=1", "/admin"]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toBe(INDEX);
      expect(res.headers["content-type"]).toMatch(/^text\/html/);
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("caches hashed files forever and sends the compressed copy when accepted", async () => {
    const plain = await get("/assets/app-abc123.js");
    expect(plain.statusCode).toBe(200);
    expect(plain.body).toBe(SCRIPT);
    expect(plain.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const compressed = await get("/assets/app-abc123.js", { "accept-encoding": "gzip" });
    expect(compressed.headers["content-encoding"]).toBe("gzip");
    expect(compressed.headers["content-type"]).toMatch(/javascript/);
  });

  it("keeps 404s for missing files and API routes, and never leaves the folder", async () => {
    for (const url of [
      "/assets/app-old.js",
      "/favicon.ico",
      "/api/nope",
      "/../package.json",
      "/%2e%2e/%2e%2e/package.json",
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(404);
      expect(res.body).not.toBe(INDEX);
    }
    expect((await get("/api/nope")).json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect((await ctx.app.inject({ method: "POST", url: "/m/abc" })).statusCode).toBe(404);
  });

  it("still answers the API", async () => {
    expect((await get("/api/health")).json()).toEqual({ status: "ok" });
  });

  it("sends security headers", async () => {
    const { headers } = await get("/");
    const csp = String(headers["content-security-policy"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    // Menu links carry the table's secret token, so they must not leak to other sites.
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });
});

describe.skipIf(!hasDatabase)("rate limits behind a proxy", () => {
  const ctx = createTestContext({ LOGIN_RATE_LIMIT: 1, TRUST_PROXY_HOPS: 1 });
  afterAll(() => ctx.cleanup());

  const attempt = (forwardedFor: string) =>
    ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-forwarded-for": forwardedFor },
      payload: { email: "nobody@example.com", password: "x" },
    });

  it("limits each visitor separately, and a fake header can't get around it", async () => {
    expect((await attempt("203.0.113.1")).statusCode).toBe(401);
    expect((await attempt("203.0.113.1")).statusCode).toBe(429);
    // Someone else in the world isn't affected…
    expect((await attempt("203.0.113.2")).statusCode).toBe(401);
    // …but a client can't pretend to be someone else: the proxy appends the real address last.
    expect((await attempt("198.51.100.9, 203.0.113.1")).statusCode).toBe(429);
  });
});
