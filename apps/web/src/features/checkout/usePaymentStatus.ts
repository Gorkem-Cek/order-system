import { paymentStatusResponseSchema } from "@siparis/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "../../lib/api";

/** Checks quickly at first, then less often if iyzico is slow to settle. */
export const POLL_FAST_MS = 3_000;
export const POLL_SLOW_MS = 10_000;
/** After this long a pending payment gets the "ask staff" hint and slower checks. */
export const SLOW_AFTER_MS = 30_000;

/** How the guest's payment on iyzico's page ended; re-checked while it's still pending. */
export function usePaymentStatus(qrToken: string, paymentId: string, startedAt: number) {
  return useQuery({
    queryKey: ["payment", qrToken, paymentId],
    queryFn: () =>
      apiFetch(
        `/menu/${encodeURIComponent(qrToken)}/payments/${encodeURIComponent(paymentId)}`,
        paymentStatusResponseSchema,
      ),
    retry: (failureCount, error) =>
      !(error instanceof ApiRequestError && [400, 404].includes(error.status)) && failureCount < 3,
    refetchInterval: (query) => {
      if (query.state.data && query.state.data.status !== "PENDING") return false;
      if (
        query.state.error instanceof ApiRequestError &&
        [400, 404].includes(query.state.error.status)
      ) {
        return false;
      }
      return Date.now() - startedAt < SLOW_AFTER_MS ? POLL_FAST_MS : POLL_SLOW_MS;
    },
    refetchOnWindowFocus: true,
  });
}
