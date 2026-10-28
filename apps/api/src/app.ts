import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Config } from "./config";
import type { PrismaClient } from "./db";
import { AppError } from "./lib/errors";
import { createAuthService } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { createSessionsRepository } from "./modules/auth/sessions.repository";
import { createUsersRepository } from "./modules/auth/users.repository";
import { adminCafesRoutes } from "./modules/cafes/admin-cafes.routes";
import { createCafesRepository } from "./modules/cafes/cafes.repository";
import { createCafesService } from "./modules/cafes/cafes.service";
import { staffCafeRoutes } from "./modules/cafes/staff-cafe.routes";
import { createMenuRepository } from "./modules/menu/menu.repository";
import { menuRoutes } from "./modules/menu/menu.routes";
import { createMenuService } from "./modules/menu/menu.service";
import { createOrdersRepository } from "./modules/orders/orders.repository";
import { createOrdersService } from "./modules/orders/orders.service";
import { staffOrdersRoutes } from "./modules/orders/staff-orders.routes";
import {
  createMockPaymentProvider,
  type PaymentProvider,
} from "./modules/payments/payment-provider";
import { authPlugin, createSessionCookie } from "./plugins/auth";
import { registerErrorHandlers } from "./plugins/error-handler";
import { healthRoutes } from "./routes/health";

export type AppDeps = {
  config: Config;
  prisma: PrismaClient;
  /** Defaults to the mock provider (MVP). */
  payments?: PaymentProvider;
  now?: () => Date;
};

export function buildApp(
  { config, prisma, payments = createMockPaymentProvider(), now }: AppDeps,
  options: FastifyServerOptions = {},
) {
  const app = Fastify(options);

  const users = createUsersRepository(prisma);
  const sessions = createSessionsRepository(prisma);
  const cafes = createCafesRepository(prisma);
  const auth = createAuthService({ users, sessions, sessionTtlDays: config.SESSION_TTL_DAYS });
  const cafesService = createCafesService({ cafes, users, sessions });
  const menuService = createMenuService({ menu: createMenuRepository(prisma) });
  const ordersService = createOrdersService({
    orders: createOrdersRepository(prisma),
    menuService,
    payments,
    ...(now && { now }),
    log: app.log,
  });
  const sessionCookie = createSessionCookie({ secure: config.NODE_ENV === "production" });

  registerErrorHandlers(app);
  app.register(cookie);
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, "RATE_LIMITED", `Too many attempts, retry in ${context.after}`),
  });
  app.register(authPlugin, { auth, cookie: sessionCookie });

  app.register(healthRoutes, { prefix: "/api" });
  app.register(authRoutes, {
    prefix: "/api/auth",
    auth,
    cookie: sessionCookie,
    loginRateLimit: config.LOGIN_RATE_LIMIT,
  });
  app.register(adminCafesRoutes, { prefix: "/api/admin", cafesService });
  app.register(staffCafeRoutes, { prefix: "/api/staff", cafes, cafesService });
  app.register(staffOrdersRoutes, { prefix: "/api/staff", cafes, ordersService });
  app.register(menuRoutes, {
    prefix: "/api/menu",
    menuService,
    ordersService,
    checkoutRateLimit: config.CHECKOUT_RATE_LIMIT,
  });

  return app;
}
