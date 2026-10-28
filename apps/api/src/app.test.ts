import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPrismaClient } from "./db";

// No database needed: these routes never query it, and the client connects lazily.
const config = loadConfig({ DATABASE_URL: "postgresql://localhost:1/unused" });
const prisma = createPrismaClient(config.DATABASE_URL);
const app = buildApp({ config, prisma });
afterAll(() => app.close());

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("error responses", () => {
  it("returns the shared error shape for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("returns VALIDATION_FAILED for an invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for malformed JSON", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("rejects protected routes without a session", async () => {
    for (const url of ["/api/auth/me", "/api/admin/cafes", "/api/staff/cafe"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(401);
      expect(res.json(), url).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    }
  });
});
