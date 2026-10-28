import { ORDER_STATUSES, type OrderStatus } from "@siparis/shared";
import { describe, expect, it } from "vitest";
import { canTransition } from "./order-status";

const allowed = new Set([
  "NEW→PREPARING",
  "NEW→CANCELLED",
  "PREPARING→SERVED",
  "PREPARING→CANCELLED",
]);

describe("canTransition", () => {
  const pairs = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.map((to) => [from, to] as [OrderStatus, OrderStatus]),
  );

  it.each(pairs)("%s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(allowed.has(`${from}→${to}`));
  });
});
