import { menuResponseSchema } from "@siparis/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "../../lib/api";

/** Errors that retrying won't fix: bad token, unknown table, inactive café. */
const isFinal = (error: unknown) =>
  error instanceof ApiRequestError && [400, 403, 404].includes(error.status);

export function useMenu(qrToken: string) {
  return useQuery({
    queryKey: ["menu", qrToken],
    queryFn: () => apiFetch(`/menu/${encodeURIComponent(qrToken)}`, menuResponseSchema),
    retry: (failureCount, error) => !isFinal(error) && failureCount < 2,
    // Refresh when the guest comes back to the tab, so sold-out items show up.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
