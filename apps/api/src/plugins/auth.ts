import { CAFE_ID_HEADER, idSchema, type SessionUser } from "@siparis/shared";
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import fp from "fastify-plugin";
import { AppError, forbidden, notFound, unauthorized } from "../lib/errors";
import type { AuthService } from "../modules/auth/auth.service";
import type { CafesRepository } from "../modules/cafes/cafes.repository";

declare module "fastify" {
  interface FastifyRequest {
    /** The logged-in user, or null. Set for every request that has a valid session cookie. */
    user: SessionUser | null;
    sessionId: string | null;
    /** The café a staff route acts on. Set by `requireCafe`. */
    cafeId: string | null;
  }
}

export const SESSION_COOKIE = "siparis_session";

export function createSessionCookie(options: { secure: boolean }) {
  const base = { path: "/", httpOnly: true, sameSite: "lax", secure: options.secure } as const;
  return {
    read: (request: FastifyRequest): string | undefined => request.cookies[SESSION_COOKIE],
    set: (reply: FastifyReply, token: string, expires: Date) =>
      reply.setCookie(SESSION_COOKIE, token, { ...base, expires }),
    clear: (reply: FastifyReply) => reply.clearCookie(SESSION_COOKIE, base),
  };
}

export type SessionCookie = ReturnType<typeof createSessionCookie>;

/** Resolves the session cookie on every request into `request.user`. */
export const authPlugin = fp<{ auth: AuthService; cookie: SessionCookie }>(
  async (app, { auth, cookie }) => {
    app.decorateRequest("user", null);
    app.decorateRequest("sessionId", null);
    app.decorateRequest("cafeId", null);

    app.addHook("onRequest", async (request, reply) => {
      const token = cookie.read(request);
      if (!token) return;

      const session = await auth.authenticate(token);
      if (!session) {
        cookie.clear(reply);
        return;
      }
      request.user = session.user;
      request.sessionId = session.sessionId;
      if (session.renewedExpiresAt) cookie.set(reply, token, session.renewedExpiresAt);
    });
  },
  { name: "auth" },
);

// --- Route guards (use as preHandler) ---

export const requireUser: preHandlerAsyncHookHandler = async (request) => {
  if (!request.user) throw unauthorized();
};

export const requireSuperAdmin: preHandlerAsyncHookHandler = async (request) => {
  if (!request.user) throw unauthorized();
  if (request.user.role !== "SUPER_ADMIN") throw forbidden();
};

/**
 * Staff routes act on one café: a staff user's own café, or — for a super-admin —
 * the café named in the X-Cafe-Id header ("open as" any café).
 */
export function requireCafe(cafes: CafesRepository): preHandlerAsyncHookHandler {
  return async (request) => {
    const { user } = request;
    if (!user) throw unauthorized();

    if (user.role === "STAFF") {
      if (!user.cafeId) throw forbidden();
      request.cafeId = user.cafeId;
      return;
    }

    const header = idSchema.safeParse(request.headers[CAFE_ID_HEADER]);
    if (!header.success) {
      throw new AppError(400, "VALIDATION_FAILED", `Header ${CAFE_ID_HEADER} is required`);
    }
    if (!(await cafes.findById(header.data))) throw notFound("Café");
    request.cafeId = header.data;
  };
}

/** The café set by `requireCafe`; only call it in routes that use that guard. */
export function cafeIdOf(request: FastifyRequest): string {
  if (!request.cafeId) throw new Error("requireCafe must run before cafeIdOf");
  return request.cafeId;
}
