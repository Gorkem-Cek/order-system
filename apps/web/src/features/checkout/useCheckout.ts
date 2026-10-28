import { checkoutResponseSchema, type CheckoutRequestInput } from "@siparis/shared";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";

export function useCheckout(qrToken: string) {
  return useMutation({
    mutationFn: (request: CheckoutRequestInput) =>
      apiFetch(`/menu/${encodeURIComponent(qrToken)}/checkout`, checkoutResponseSchema, {
        method: "POST",
        body: JSON.stringify(request),
      }),
  });
}
