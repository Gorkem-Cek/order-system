import { changePasswordRequestSchema, loginRequestSchema } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../lib/errors";
import { requireUser, type SessionCookie } from "../../plugins/auth";
import type { AuthService } from "./auth.service";

export const authRoutes: FastifyPluginAsync<{
  auth: AuthService;
  cookie: SessionCookie;
  loginRateLimit: number;
}> = async (app, { auth, cookie, loginRateLimit }) => {
  app.post(
    "/login",
    { config: { rateLimit: { max: loginRateLimit, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { email, password } = loginRequestSchema.parse(request.body);
      const { token, expiresAt, user } = await auth.login(email, password);
      cookie.set(reply, token, expiresAt);
      return user;
    },
  );

  app.post("/logout", async (request, reply) => {
    const token = cookie.read(request);
    if (token) await auth.logout(token);
    cookie.clear(reply);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: requireUser }, async (request) => request.user);

  app.post("/password", { preHandler: requireUser }, async (request, reply) => {
    const { currentPassword, newPassword } = changePasswordRequestSchema.parse(request.body);
    if (!request.user || !request.sessionId) throw unauthorized();
    await auth.changePassword({
      userId: request.user.id,
      sessionId: request.sessionId,
      currentPassword,
      newPassword,
    });
    return reply.code(204).send();
  });
};
