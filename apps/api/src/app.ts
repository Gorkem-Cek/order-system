import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { MAX_IMAGE_BYTES } from "@siparis/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Config } from "./config";
import type { PrismaClient } from "./db";
import { AppError } from "./lib/errors";
import { createEventBus } from "./lib/event-bus";
import { createLocalStorage, UPLOADS_PATH } from "./lib/storage";
import { createAuthService } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { createSessionsRepository } from "./modules/auth/sessions.repository";
import { createUsersRepository } from "./modules/auth/users.repository";
import { adminCafesRoutes } from "./modules/cafes/admin-cafes.routes";
import { createCafesRepository } from "./modules/cafes/cafes.repository";
import { createCafesService } from "./modules/cafes/cafes.service";
import { staffCafeRoutes } from "./modules/cafes/staff-cafe.routes";
import { staffEventsRoutes } from "./modules/events/staff-events.routes";
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
import { createStaffMenuRepository } from "./modules/staff-menu/staff-menu.repository";
import { staffMenuRoutes } from "./modules/staff-menu/staff-menu.routes";
import { createStaffMenuService } from "./modules/staff-menu/staff-menu.service";
import { createTablesRepository } from "./modules/tables/tables.repository";
import { tablesRoutes } from "./modules/tables/tables.routes";
import { createTablesService } from "./modules/tables/tables.service";
import { createWaiterCallsRepository } from "./modules/waiter-calls/waiter-calls.repository";
import {
  guestWaiterCallRoutes,
  staffWaiterCallRoutes,
} from "./modules/waiter-calls/waiter-calls.routes";
import { createWaiterCallsService } from "./modules/waiter-calls/waiter-calls.service";
import { authPlugin, createSessionCookie } from "./plugins/auth";
import { registerErrorHandlers } from "./plugins/error-handler";
import { healthRoutes } from "./routes/health";
import { uploadsRoutes } from "./routes/uploads";
import { webRoutes } from "./routes/web";

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
  const app = Fastify({
    ...options,
    // A function, because Fastify ignores a plain hop count. Hop 0 is the connection itself.
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
  });

  const users = createUsersRepository(prisma);
  const sessions = createSessionsRepository(prisma);
  const cafes = createCafesRepository(prisma);
  const auth = createAuthService({ users, sessions, sessionTtlDays: config.SESSION_TTL_DAYS });
  const storage = createLocalStorage(config.UPLOAD_DIR);
  const cafesService = createCafesService({ cafes, users, sessions, storage });
  const menuRepository = createMenuRepository(prisma);
  const menuService = createMenuService({ menu: menuRepository });
  const staffMenu = createStaffMenuService({
    staffMenu: createStaffMenuRepository(prisma),
    menu: menuRepository,
    storage,
    ...(now && { now }),
  });
  const events = createEventBus();
  const ordersService = createOrdersService({
    orders: createOrdersRepository(prisma),
    menuService,
    payments,
    events,
    ...(now && { now }),
    log: app.log,
  });
  const waiterCalls = createWaiterCallsService({
    calls: createWaiterCallsRepository(prisma),
    menuService,
    events,
    ...(now && { now }),
  });
  const tables = createTablesService({
    tables: createTablesRepository(prisma),
    events,
    publicUrl: config.PUBLIC_URL,
  });
  const sessionCookie = createSessionCookie({ secure: config.NODE_ENV === "production" });

  registerErrorHandlers(app, { serveWebApp: Boolean(config.WEB_DIR) });
  app.register(helmet, {
    // No "unsafe-inline" scripts. Inline styles carry the café's colour; data: images are QR codes.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // Menu links carry the table's secret token.
    referrerPolicy: { policy: "no-referrer" },
  });
  app.register(cookie);
  app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 } });
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, "RATE_LIMITED", `Too many attempts, retry in ${context.after}`),
  });
  app.register(authPlugin, { auth, cookie: sessionCookie });

  app.register(healthRoutes, { prefix: "/api" });
  app.register(uploadsRoutes, { prefix: UPLOADS_PATH, storage });
  app.register(authRoutes, {
    prefix: "/api/auth",
    auth,
    cookie: sessionCookie,
    loginRateLimit: config.LOGIN_RATE_LIMIT,
  });
  app.register(adminCafesRoutes, { prefix: "/api/admin", cafesService });
  app.register(staffCafeRoutes, { prefix: "/api/staff", cafes, cafesService });
  app.register(staffOrdersRoutes, { prefix: "/api/staff", cafes, ordersService });
  app.register(staffEventsRoutes, { prefix: "/api/staff", cafes, events });
  app.register(menuRoutes, {
    prefix: "/api/menu",
    menuService,
    ordersService,
    checkoutRateLimit: config.CHECKOUT_RATE_LIMIT,
  });
  app.register(guestWaiterCallRoutes, {
    prefix: "/api/menu",
    waiterCalls,
    rateLimit: config.CHECKOUT_RATE_LIMIT,
  });
  app.register(staffWaiterCallRoutes, { prefix: "/api/staff", cafes, waiterCalls });
  app.register(staffMenuRoutes, { prefix: "/api/staff", cafes, staffMenu });
  app.register(tablesRoutes, { prefix: "/api/staff/tables", cafes, tables });
  if (config.WEB_DIR) app.register(webRoutes, { root: config.WEB_DIR });

  return app;
}
