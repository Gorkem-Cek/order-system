import type { Order } from "@siparis/shared";
import { describe, expect, it } from "vitest";
import { upsertActiveOrder } from "./useOrders";

const order = (id: string, createdAt: string, status: Order["status"] = "NEW"): Order => ({
  id,
  orderNumber: 1,
  tableName: "Masa 1",
  status,
  note: null,
  totalKurus: 4000,
  createdAt,
  updatedAt: createdAt,
  items: [],
});

describe("upsertActiveOrder", () => {
  const a = order("a", "2026-10-28T10:00:00.000Z");
  const b = order("b", "2026-10-28T10:05:00.000Z");

  it("adds new orders in time order", () => {
    expect(upsertActiveOrder([b], a).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("replaces an order that changed", () => {
    const updated = upsertActiveOrder([a, b], { ...a, status: "PREPARING" });
    expect(updated.map((o) => [o.id, o.status])).toEqual([
      ["a", "PREPARING"],
      ["b", "NEW"],
    ]);
  });

  it("removes served and cancelled orders", () => {
    expect(upsertActiveOrder([a, b], { ...a, status: "SERVED" }).map((o) => o.id)).toEqual(["b"]);
    expect(upsertActiveOrder([a, b], { ...b, status: "CANCELLED" }).map((o) => o.id)).toEqual([
      "a",
    ]);
  });
});
