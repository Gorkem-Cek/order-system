import { sessionUserSchema, type LoginRequest, type SessionUser } from "@siparis/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, ApiRequestError } from "../../lib/api";

export const SESSION_QUERY_KEY = ["session"] as const;

/** The logged-in user, or null when logged out. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        return await apiFetch("/auth/me", sessionUserSchema);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch("/auth/login", sessionUserSchema, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (user) => queryClient.setQueryData(SESSION_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/auth/logout", z.undefined(), { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  });
}
