import {
  ACTIVE_ORDER_STATUSES,
  activeOrdersResponseSchema,
  orderSchema,
  type Order,
  type OrderStatus,
  type UpdateOrderStatusRequest,
} from "@siparis/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

export function applyOrder(queryClient: QueryClient, cafeId: string, order: Order) {
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
