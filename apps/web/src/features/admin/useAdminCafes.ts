import {
  adminCafeSchema,
  adminCafesResponseSchema,
  type CreateCafeRequest,
  type UpdateCafeRequest,
} from "@siparis/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../../lib/api";

export const ADMIN_CAFES_KEY = ["admin", "cafes"] as const;

export function useAdminCafes() {
  return useQuery({
    queryKey: ADMIN_CAFES_KEY,
    queryFn: async () => (await apiFetch("/admin/cafes", adminCafesResponseSchema)).cafes,
  });
}

export function useAdminCafeActions() {
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: ADMIN_CAFES_KEY });
  return {
    create: useMutation({
      mutationFn: (body: CreateCafeRequest) =>
        apiFetch("/admin/cafes", adminCafeSchema, { method: "POST", body: JSON.stringify(body) }),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: UpdateCafeRequest & { id: string }) =>
        apiFetch(`/admin/cafes/${id}`, adminCafeSchema, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      onSettled,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
        apiFetch(`/admin/cafes/${id}/password`, z.undefined(), {
          method: "POST",
          body: JSON.stringify({ newPassword }),
        }),
    }),
  };
}

export type AdminCafeActions = ReturnType<typeof useAdminCafeActions>;
