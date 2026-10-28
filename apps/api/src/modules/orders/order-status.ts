import type { OrderStatus } from "@siparis/shared";

/**
 * The only place that decides how an order's status may change (see CLAUDE.md):
 * new → preparing → served, and cancelled only from new or preparing.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ["PREPARING", "CANCELLED"],
  PREPARING: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
