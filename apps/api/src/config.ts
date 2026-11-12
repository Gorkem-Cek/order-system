import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("localhost"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Login attempts allowed per IP per minute.
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Checkout attempts allowed per IP and table per minute.
  CHECKOUT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Where uploaded images are stored (relative to the API's working directory).
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  // Public address of the web app; table QR codes link to <PUBLIC_URL>/m/<qrToken>.
  PUBLIC_URL: z
    .url({ protocol: /^https?$/ })
    .default("http://localhost:5173")
    .transform((url) => url.replace(/\/+$/, "")),
  // The header in which the proxy in front of the API gives the visitor's address.
  CLIENT_IP_HEADER: z.string().min(1).toLowerCase().optional(),
  // Encrypts cafés' iyzico secret keys in the database: 32 random bytes, base64
  // (`openssl rand -base64 32`). Losing it means re-entering every café's keys.
  PAYMENT_SECRET_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, "Must be 32 bytes, base64")
    .optional(),
  // The fake card payment: on in development and tests, off in production, where a café
  // can only take orders once its iyzico account is connected.
  ALLOW_MOCK_PAYMENTS: z.stringbool().default(true),
  // The built web app, served by the API when set (relative to the API's working directory).
  WEB_DIR: z.string().min(1).optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env["NODE_ENV"] === "production";
  const config = envSchema.parse({
    ...(production && {
      API_HOST: "0.0.0.0",
      CLIENT_IP_HEADER: "x-real-ip",
      ALLOW_MOCK_PAYMENTS: "false",
      WEB_DIR: "../web/dist",
    }),
    // Provided by Railway.
    ...(env["PORT"] && { API_PORT: env["PORT"] }),
    ...(env["RAILWAY_PUBLIC_DOMAIN"] && { PUBLIC_URL: `https://${env["RAILWAY_PUBLIC_DOMAIN"]}` }),
    ...env,
  });

  if (production) {
    if (new URL(config.PUBLIC_URL).hostname === "localhost") {
      throw new Error("Set PUBLIC_URL: printed QR codes would otherwise link to localhost.");
    }
    if (!env["UPLOAD_DIR"]) {
      throw new Error("Set UPLOAD_DIR to persistent storage: uploaded images would be lost.");
    }
  }
  return config;
}
