import { CAFE_ID_HEADER } from "@siparis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase, TEST_PASSWORD } from "../../test/helpers";

describe.skipIf(!hasDatabase)("café routes", () => {
  const ctx = createTestContext();
  let adminCookie = "";

  beforeAll(async () => {
    const admin = await ctx.createSuperAdmin();
    adminCookie = await ctx.login(admin.email);
  });
  afterAll(() => ctx.cleanup());

  const admin = (method: "GET" | "POST" | "PATCH", url: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: { cookie: adminCookie }, ...(payload && { payload }) });

  describe("super-admin /api/admin/cafes", () => {
    it("is forbidden for café staff", async () => {
      const { loginEmail } = await ctx.createCafe();
      const cookie = await ctx.login(loginEmail);
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/admin/cafes",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    });

    it("creates a café whose shared login works", async () => {
      const loginEmail = ctx.email("new");
      const res = await admin("POST", "/api/admin/cafes", {
        name: "  Yeni Kafe ",
        slug: `${ctx.prefix}-yeni`,
        loginEmail,
        loginPassword: "yeni-kafe-sifresi",
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: "Yeni Kafe",
        slug: `${ctx.prefix}-yeni`,
        isActive: true,
        loginEmail,
      });
      await expect(ctx.login(loginEmail, "yeni-kafe-sifresi")).resolves.toBeTruthy();

      const list = await admin("GET", "/api/admin/cafes");
      expect(list.json().cafes).toContainEqual(expect.objectContaining({ loginEmail }));
    });

    it("rejects a duplicate slug or login email", async () => {
      const { cafe, loginEmail } = await ctx.createCafe();
      const base = { name: "Kopya", loginPassword: "yeni-kafe-sifresi" };

      const dupSlug = await admin("POST", "/api/admin/cafes", {
        ...base,
        slug: cafe.slug,
        loginEmail: ctx.email("fresh"),
      });
      expect(dupSlug.statusCode).toBe(409);
      expect(dupSlug.json()).toMatchObject({
        error: { code: "CONFLICT", details: { field: "slug" } },
      });

      const dupEmail = await admin("POST", "/api/admin/cafes", {
        ...base,
        slug: `${ctx.prefix}-fresh`,
        loginEmail,
      });
      expect(dupEmail.statusCode).toBe(409);
      expect(dupEmail.json()).toMatchObject({ error: { details: { field: "loginEmail" } } });
    });

    it("rejects an invalid slug", async () => {
      const res = await admin("POST", "/api/admin/cafes", {
        name: "Kafe",
        slug: "Büyük Kafe!",
        loginEmail: ctx.email("x"),
        loginPassword: "yeni-kafe-sifresi",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    });

    it("deactivating a café logs its staff out and blocks login", async () => {
      const { cafe, loginEmail } = await ctx.createCafe();
      const staffCookie = await ctx.login(loginEmail);

      const res = await admin("PATCH", `/api/admin/cafes/${cafe.id}`, { isActive: false });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ isActive: false });

      const me = await ctx.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: staffCookie },
      });
      expect(me.statusCode).toBe(401);
      await expect(ctx.login(loginEmail)).rejects.toThrow(/403/);

      await admin("PATCH", `/api/admin/cafes/${cafe.id}`, { isActive: true });
      await expect(ctx.login(loginEmail)).resolves.toBeTruthy();
    });

    it("resets the café password and logs its staff out", async () => {
      const { cafe, loginEmail } = await ctx.createCafe();
      const staffCookie = await ctx.login(loginEmail);

      const res = await admin("POST", `/api/admin/cafes/${cafe.id}/password`, {
        newPassword: "sifirlanmis-sifre",
      });
      expect(res.statusCode).toBe(204);

      const me = await ctx.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: staffCookie },
      });
      expect(me.statusCode).toBe(401);
      await expect(ctx.login(loginEmail, TEST_PASSWORD)).rejects.toThrow();
      await expect(ctx.login(loginEmail, "sifirlanmis-sifre")).resolves.toBeTruthy();
    });

    it("returns 404 for an unknown café", async () => {
      const res = await admin("PATCH", "/api/admin/cafes/cknotarealcafeid000000000", {
        isActive: false,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/staff/cafe", () => {
    it("returns the staff user's own café", async () => {
      const { cafe, loginEmail } = await ctx.createCafe();
      const other = await ctx.createCafe();
      const cookie = await ctx.login(loginEmail);

      // A staff user can't switch café with the header.
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/staff/cafe",
        headers: { cookie, [CAFE_ID_HEADER]: other.cafe.id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: cafe.id, slug: cafe.slug });
    });

    it("lets a super-admin open any café with the X-Cafe-Id header", async () => {
      const { cafe } = await ctx.createCafe({ isActive: false });

      const withHeader = await ctx.app.inject({
        method: "GET",
        url: "/api/staff/cafe",
        headers: { cookie: adminCookie, [CAFE_ID_HEADER]: cafe.id },
      });
      expect(withHeader.statusCode).toBe(200);
      expect(withHeader.json()).toMatchObject({ id: cafe.id, isActive: false });

      const without = await admin("GET", "/api/staff/cafe");
      expect(without.statusCode).toBe(400);

      const unknown = await ctx.app.inject({
        method: "GET",
        url: "/api/staff/cafe",
        headers: { cookie: adminCookie, [CAFE_ID_HEADER]: "cknotarealcafeid000000000" },
      });
      expect(unknown.statusCode).toBe(404);
    });
  });
});
