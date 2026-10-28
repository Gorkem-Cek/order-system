import {
  ACTIVE_ORDER_STATUSES,
  activeOrdersResponseSchema,
  orderSchema,
  STAFF_EVENT_TYPES,
  STAFF_EVENTS_READY,
  staffEventSchema,
  type Order,
  type OrderStatus,
  type UpdateOrderStatusRequest,
} from "@siparis/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { useStaff } from "../staff/staff-context";

export const activeOrdersKey = (cafeId: string) => ["staff", cafeId, "orders", "active"] as const;

const isActive = (status: OrderStatus) =>
  (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);

/** Puts a changed order into the board's list, or takes it out once it's served/cancelled. */
export function upsertActiveOrder(orders: Order[], order: Order): Order[] {
  const rest = orders.filter((o) => o.id !== order.id);
  if (!isActive(order.status)) return rest;
  return [...rest, order].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function applyOrder(queryClient: QueryClient, cafeId: string, order: Order) {
  queryClient.setQueryData<Order[]>(activeOrdersKey(cafeId), (orders) =>
    orders ? upsertActiveOrder(orders, order) : orders,
  );
}

export function useActiveOrders() {
  const { cafe, staffFetch } = useStaff();
  return useQuery({
    queryKey: activeOrdersKey(cafe.id),
    queryFn: async () => (await staffFetch("/staff/orders", activeOrdersResponseSchema)).orders,
  });
}

export function useUpdateOrderStatus() {
  const { cafe, staffFetch } = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string } & UpdateOrderStatusRequest) =>
      staffFetch(`/staff/orders/${orderId}/status`, orderSchema, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (order) => applyOrder(queryClient, cafe.id, order),
  });
}

export type StreamStatus = "connecting" | "live" | "reconnecting";

/**
 * Subscribes to the live staff stream and keeps the board's cache up to date. After every
 * (re)connect the list is refetched, so orders placed while offline aren't missed.
 */
export function useOrderStream(onCreated: (order: Order) => void): StreamStatus {
  const { cafe, cafeQuery } = useStaff();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const handleCreated = useEffectEvent(onCreated);

  useEffect(() => {
    const source = new EventSource(`/api/staff/events${cafeQuery}`);

    source.addEventListener(STAFF_EVENTS_READY, () => {
      setStatus("live");
      void queryClient.invalidateQueries({ queryKey: activeOrdersKey(cafe.id) });
    });
    const onMessage = (message: MessageEvent<string>) => {
      const parsed = staffEventSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) return;
      applyOrder(queryClient, cafe.id, parsed.data.order);
      if (parsed.data.type === "order.created") handleCreated(parsed.data.order);
    };
    for (const type of STAFF_EVENT_TYPES) source.addEventListener(type, onMessage);
    // EventSource reconnects by itself; this only updates the indicator.
    source.onerror = () => setStatus("reconnecting");

    return () => source.close();
  }, [cafe.id, cafeQuery, queryClient]);

  return status;
}
