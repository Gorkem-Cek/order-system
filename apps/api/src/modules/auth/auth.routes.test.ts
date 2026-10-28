import { afterAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../plugins/auth";
import {
  createTestContext,
  hasDatabase,
  sessionCookieHeader,
  TEST_PASSWORD,
} from "../../test/helpers";
import { hashToken } from "../../lib/tokens";

describe.skipIf(!hasDatabase)("auth routes", () => {
  const ctx = createTestContext();
  afterAll(() => ctx.cleanup());

  const me = (cookie?: string) =>
    ctx.app.inject({ method: "GET", url: "/api/auth/me", headers: cookie ? { cookie } : {} });

  describe("POST /api/auth/login", () => {
    it("sets an httpOnly session cookie and returns the user", async () => {
      const { cafe, loginEmail } = await ctx.createCafe();
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: `  ${loginEmail.toUpperCase()} `, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: loginEmail, role: "STAFF", cafeId: cafe.id });
      const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

      const meRes = await me(sessionCookieHeader(res));
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json()).toMatchObject({ email: loginEmail });
    });

    it("stores only a hash of the session token", async () => {
      const { loginEmail } = await ctx.createCafe();
      const token = (await ctx.login(loginEmail)).split("=")[1] ?? "";
      expect(await ctx.prisma.session.count({ where: { tokenHash: token } })).toBe(0);
      expect(await ctx.prisma.session.count({ where: { tokenHash: hashToken(token) } })).toBe(1);
    });

    it("rejects a wrong password and an unknown email the same way", async () => {
      const { loginEmail } = await ctx.createCafe();
      for (const payload of [
        { email: loginEmail, password: "wrong-password" },
        { email: ctx.email("nobody"), password: TEST_PASSWORD },
      ]) {
        const res = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
      }
    });

    it("refuses staff of an inactive café", async () => {
      const { loginEmail } = await ctx.createCafe({ isActive: false });
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: loginEmail, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: "CAFE_INACTIVE" } });
    });

    it("is rate limited per IP", async () => {
      const limited = createTestContext({ LOGIN_RATE_LIMIT: 2 });
      try {
        const attempt = () =>
          limited.app.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: limited.email("x"), password: "x" },
          });
        expect((await attempt()).statusCode).toBe(401);
        expect((await attempt()).statusCode).toBe(401);
        const blocked = await attempt();
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
      } finally {
        await limited.cleanup();
      }
    });
  });

  describe("sessions", () => {
    it("logout ends the session", async () => {
      const { loginEmail } = await ctx.createCafe();
      const cookie = await ctx.login(loginEmail);
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(204);
      expect((await me(cookie)).statusCode).toBe(401);
    });

    it("rejects an expired session and deletes it", async () => {
      const { loginEmail } = await ctx.createCafe();
      const cookie = await ctx.login(loginEmail);
      const tokenHash = hashToken(cookie.split("=")[1] ?? "");
      await ctx.prisma.session.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });

      expect((await me(cookie)).statusCode).toBe(401);
      expect(await ctx.prisma.session.count({ where: { tokenHash } })).toBe(0);
    });

    it("extends a session that is past half of its lifetime", async () => {
      const { loginEmail } = await ctx.createCafe();
      const cookie = await ctx.login(loginEmail);
      const tokenHash = hashToken(cookie.split("=")[1] ?? "");
      const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await ctx.prisma.session.update({ where: { tokenHash }, data: { expiresAt: soon } });

      const res = await me(cookie);
      expect(res.statusCode).toBe(200);
      expect(res.cookies.find((c) => c.name === SESSION_COOKIE)).toBeDefined();
      const session = await ctx.prisma.session.findUniqueOrThrow({ where: { tokenHash } });
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    });

    it("ignores a made-up session cookie", async () => {
      expect((await me(`${SESSION_COOKIE}=made-up`)).statusCode).toBe(401);
    });
  });

  describe("POST /api/auth/password", () => {
    it("changes the password and logs out other devices only", async () => {
      const { loginEmail } = await ctx.createCafe();
      const thisDevice = await ctx.login(loginEmail);
      const otherDevice = await ctx.login(loginEmail);

      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: { cookie: thisDevice },
        payload: { currentPassword: TEST_PASSWORD, newPassword: "a-brand-new-password" },
      });
      expect(res.statusCode).toBe(204);

      expect((await me(thisDevice)).statusCode).toBe(200);
      expect((await me(otherDevice)).statusCode).toBe(401);
      await expect(ctx.login(loginEmail)).rejects.toThrow();
      await expect(ctx.login(loginEmail, "a-brand-new-password")).resolves.toBeTruthy();
    });

    it("requires the correct current password", async () => {
      const { loginEmail } = await ctx.createCafe();
      const cookie = await ctx.login(loginEmail);
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: { cookie },
        payload: { currentPassword: "not-it", newPassword: "a-brand-new-password" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    });
  });
});
