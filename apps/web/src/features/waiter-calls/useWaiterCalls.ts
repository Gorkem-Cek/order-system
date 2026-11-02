import { openWaiterCallsResponseSchema, type WaiterCall } from "@siparis/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useStaff } from "../staff/staff-context";

export const waiterCallsKey = (cafeId: string) => ["staff", cafeId, "waiter-calls"] as const;

/** Adds a call or replaces it (a repeat call), oldest first. */
export function upsertCall(calls: WaiterCall[], call: WaiterCall): WaiterCall[] {
  return [...calls.filter((c) => c.id !== call.id), call].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export function applyCall(queryClient: QueryClient, cafeId: string, call: WaiterCall) {
  queryClient.setQueryData<WaiterCall[]>(waiterCallsKey(cafeId), (calls) =>
    calls ? upsertCall(calls, call) : calls,
  );
}

export function removeCall(queryClient: QueryClient, cafeId: string, callId: string) {
  queryClient.setQueryData<WaiterCall[]>(waiterCallsKey(cafeId), (calls) =>
    calls?.filter((c) => c.id !== callId),
  );
}

export function useOpenWaiterCalls() {
  const { cafe, staffFetch } = useStaff();
  return useQuery({
    queryKey: waiterCallsKey(cafe.id),
    queryFn: async () =>
      (await staffFetch("/staff/waiter-calls", openWaiterCallsResponseSchema)).calls,
  });
}

export function useResolveWaiterCall() {
  const { cafe, staffFetch } = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (callId: string) =>
      staffFetch(`/staff/waiter-calls/${callId}/resolve`, z.undefined(), { method: "POST" }),
    onSuccess: (_, callId) => removeCall(queryClient, cafe.id, callId),
  });
}
