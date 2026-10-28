import { z } from "zod";
import { idSchema } from "./common";

/** A table can call the waiter at most once per this many seconds. */
export const WAITER_CALL_COOLDOWN_SECONDS = 60;

// POST /api/menu/:qrToken/waiter-call (no body; the table comes from the QR token)
export const waiterCallResponseSchema = z.object({
  cooldownSeconds: z.int().nonnegative(),
});

// Staff side: open calls shown above the order board.
export const waiterCallSchema = z.object({
  id: idSchema,
  tableName: z.string(),
  createdAt: z.iso.datetime(),
});

export const openWaiterCallsResponseSchema = z.object({ calls: z.array(waiterCallSchema) });

export type WaiterCallResponse = z.infer<typeof waiterCallResponseSchema>;
export type WaiterCall = z.infer<typeof waiterCallSchema>;
export type OpenWaiterCallsResponse = z.infer<typeof openWaiterCallsResponseSchema>;
