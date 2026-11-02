import { z } from "zod";
import { orderSchema } from "./orders";

// GET /api/staff/events — Server-Sent Events for the live staff board. Each message's
// `event:` field is the type below and its `data:` is the JSON of the whole event.

export const staffEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("order.created"), order: orderSchema }),
  z.object({ type: z.literal("order.updated"), order: orderSchema }),
]);

export type StaffEvent = z.infer<typeof staffEventSchema>;
export type StaffEventType = StaffEvent["type"];

export const STAFF_EVENT_TYPES = [
  "order.created",
  "order.updated",
] as const satisfies readonly StaffEventType[];

/** Sent once when the stream opens (and after every reconnect). */
export const STAFF_EVENTS_READY = "ready";

/** Query parameter a super-admin uses instead of the X-Cafe-Id header (EventSource can't set headers). */
export const CAFE_ID_QUERY = "cafeId";
