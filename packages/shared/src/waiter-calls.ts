import { z } from "zod";
import { idSchema } from "./common";

/** A table can call the waiter at most once per this many seconds. */
export const WAITER_CALL_COOLDOWN_SECONDS = 60;

// POST /api/menu/:qrToken/waiter-call (no body; the table comes from the QR token).
// While cooling down the API answers 429 WAITER_CALL_COOLDOWN with details.retryAfterSeconds.
export const waiterCallResponseSchema = z.object({
  cooldownSeconds: z.int().nonnegative(),
});

// Staff side: open calls shown above the order board.
export const waiterCallSchema = z.object({
  id: idSchema,
  tableName: z.string(),
  createdAt: z.iso.datetime(),
  /** When the guest last pressed the button; later than createdAt after a repeat call. */
  lastCalledAt: z.iso.datetime(),
  /** How many times the guest has pressed the button for this call. */
  callCount: z.int().positive(),
});

export const openWaiterCallsResponseSchema = z.object({ calls: z.array(waiterCallSchema) });

export type WaiterCallResponse = z.infer<typeof waiterCallResponseSchema>;
export type WaiterCall = z.infer<typeof waiterCallSchema>;
export type OpenWaiterCallsResponse = z.infer<typeof openWaiterCallsResponseSchema>;
