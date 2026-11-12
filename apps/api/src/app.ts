import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { MAX_IMAGE_BYTES } from "@siparis/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Config } from "./config";
import type { PrismaClient } from "./db";
import { decorateClientIp } from "./lib/client-ip";
import { AppError } from "./lib/errors";
import { createEventBus } from "./lib/event-bus";
import { createSecretBox, parseSecretKey } from "./lib/secret-box";
import { createLocalStorage, UPLOADS_PATH } from "./lib/storage";
import { createAuthService } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { createSessionsRepository } from "./modules/auth/sessions.repository";
import { createUsersRepository } from "./modules/auth/users.repository";
import { adminCafesRoutes } from "./modules/cafes/admin-cafes.routes";
import { createCafesRepository } from "./modules/cafes/cafes.repository";
import { createCafePaymentsService } from "./modules/cafes/cafe-payments.service";
import { createCafesService } from "./modules/cafes/cafes.service";
import { staffCafeRoutes } from "./modules/cafes/staff-cafe.routes";
import { staffEventsRoutes } from "./modules/events/staff-events.routes";
import { createMenuRepository } from "./modules/menu/menu.repository";
import { menuRoutes } from "./modules/menu/menu.routes";
import { createMenuService } from "./modules/menu/menu.service";
import { createOrdersRepository } from "./modules/orders/orders.repository";
import { createOrdersService } from "./modules/orders/orders.service";
import { staffOrdersRoutes } from "./modules/orders/staff-orders.routes";
import { createIyzicoClient, type IyzicoCredentials } from "./modules/payments/iyzico";
import { createIyzicoCheckoutService } from "./modules/payments/iyzico-checkout.service";
import { iyzicoRoutes } from "./modules/payments/iyzico.routes";
import { createPaymentAttemptsRepository } from "./modules/payments/payment-attempts.repository";
import { businessDate } from "./lib/business-date";
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
  /** How the API reaches iyzico; tests pass a fake. */
  iyzicoFetch?: typeof fetch;
};

export function buildApp(
  { config, prisma, payments = createMockPaymentProvider(), now, iyzicoFetch }: AppDeps,
  options: FastifyServerOptions = {},
) {
  const app = Fastify(options);
  decorateClientIp(app, config.CLIENT_IP_HEADER);

  const users = createUsersRepository(prisma);
  const sessions = createSessionsRepository(prisma);
  const cafes = createCafesRepository(prisma);
  const auth = createAuthService({ users, sessions, sessionTtlDays: config.SESSION_TTL_DAYS });
  const storage = createLocalStorage(config.UPLOAD_DIR);
  const secretBox = config.PAYMENT_SECRET_KEY
    ? createSecretBox(parseSecretKey(config.PAYMENT_SECRET_KEY))
    : null;
  const cafePayments = createCafePaymentsService({
    cafes,
    secretBox,
    iyzico: (credentials) => iyzicoClientFor(credentials),
  });
  const cafesService = createCafesService({ cafes, users, sessions, storage });
  const menuRepository = createMenuRepository(prisma);
  const events = createEventBus();
  const iyzicoClientFor = (credentials: IyzicoCredentials) =>
    createIyzicoClient(credentials, { ...(iyzicoFetch && { fetch: iyzicoFetch }) });
  const iyzicoCheckout = createIyzicoCheckoutService({
    attempts: createPaymentAttemptsRepository(prisma),
    secretBox,
    iyzico: iyzicoClientFor,
    events,
    publicUrl: config.PUBLIC_URL,
    businessDate: () => businessDate(now ? now() : new Date()),
    ...(now && { now }),
    log: app.log,
  });
  const menuService = createMenuService({
    menu: menuRepository,
    acceptsIyzico: iyzicoCheckout.canAccept,
    allowMockPayments: config.ALLOW_MOCK_PAYMENTS,
  });
  const staffMenu = createStaffMenuService({
    staffMenu: createStaffMenuRepository(prisma),
    menu: menuRepository,
    storage,
    ...(now && { now }),
  });
  const ordersService = createOrdersService({
    orders: createOrdersRepository(prisma),
    menuService,
    payments,
    iyzicoCheckout,
    allowMockPayments: config.ALLOW_MOCK_PAYMENTS,
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
    keyGenerator: (request) => request.clientIp,
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
  app.register(adminCafesRoutes, { prefix: "/api/admin", cafesService, cafePayments });
  app.register(staffCafeRoutes, { prefix: "/api/staff", cafes, cafesService });
  app.register(staffOrdersRoutes, { prefix: "/api/staff", cafes, ordersService });
  app.register(staffEventsRoutes, { prefix: "/api/staff", cafes, events });
  app.register(menuRoutes, {
    prefix: "/api/menu",
    menuService,
    ordersService,
    iyzicoCheckout,
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
  app.register(iyzicoRoutes, { prefix: "/api/payments/iyzico", iyzicoCheckout });
  if (config.WEB_DIR) app.register(webRoutes, { root: config.WEB_DIR });

  return app;
}
