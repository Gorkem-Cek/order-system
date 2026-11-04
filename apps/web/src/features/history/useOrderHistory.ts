import { orderHistoryResponseSchema, type OrderStatus } from "@siparis/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useStaff } from "../staff/staff-context";

export type HistoryFilter = {
  from: string;
  to: string;
  status: OrderStatus | null;
  page: number;
};

export function useOrderHistory(filter: HistoryFilter) {
  const { cafe, staffFetch } = useStaff();
  return useQuery({
    queryKey: ["staff", cafe.id, "orders", "history", filter],
    queryFn: () => {
      const params = new URLSearchParams({
        from: filter.from,
        to: filter.to,
        page: String(filter.page),
      });
      if (filter.status) params.set("status", filter.status);
      return staffFetch(`/staff/orders/history?${params}`, orderHistoryResponseSchema);
    },
    // Keep showing the current page while the next one loads.
    placeholderData: keepPreviousData,
  });
}
