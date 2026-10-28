import { z } from "zod";

// Every API error response has this shape. The web app maps `code` to a translated
// message, so `message` is for logs and developers only.

export const API_ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "CAFE_INACTIVE",
  "INVALID_CART",
  "PAYMENT_FAILED",
  "INVALID_STATUS_TRANSITION",
  "WAITER_CALL_COOLDOWN",
  "INTERNAL_ERROR",
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    // Extra context, e.g. which cart line failed or how long a cooldown lasts.
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
