import { staffTableSchema, staffTablesResponseSchema } from "@siparis/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useStaff } from "../staff/staff-context";

export const staffTablesKey = (cafeId: string) => ["staff", cafeId, "tables"] as const;

export function useTables() {
  const { cafe, staffFetch } = useStaff();
  return useQuery({
    queryKey: staffTablesKey(cafe.id),
    queryFn: async () => (await staffFetch("/staff/tables", staffTablesResponseSchema)).tables,
  });
}

/** A table change that reloads the list when it's done (also after a failure). */
function useTableMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const { cafe } = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: staffTablesKey(cafe.id) }),
  });
}

export function useTableActions() {
  const { staffFetch } = useStaff();
  return {
    create: useTableMutation((name: string) =>
      staffFetch("/staff/tables", staffTableSchema, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    ),
    rename: useTableMutation(({ id, name }: { id: string; name: string }) =>
      staffFetch(`/staff/tables/${id}`, staffTableSchema, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    ),
    regenerateQr: useTableMutation((id: string) =>
      staffFetch(`/staff/tables/${id}/qr`, staffTableSchema, { method: "POST" }),
    ),
    remove: useTableMutation((id: string) =>
      staffFetch(`/staff/tables/${id}`, z.undefined(), { method: "DELETE" }),
    ),
  };
}

export type TableActions = ReturnType<typeof useTableActions>;

/** The server's SVG as an image URL, so it can be shown with a plain <img>. */
export function qrImageSrc(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
