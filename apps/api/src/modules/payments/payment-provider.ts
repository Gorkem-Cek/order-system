import type { Payment } from "@siparis/shared";
import { randomBytes } from "node:crypto";

export type ChargeRequest = {
  amountKurus: number;
  payment: Payment;
  /** Shown on statements / provider dashboards, e.g. "Demo Kafe · Masa 5". */
  description: string;
};

export type ChargeResult = { ok: true; reference: string } | { ok: false; reason: string };

/** A payment provider. The MVP uses the mock; a real one (e.g. iyzico) implements the same. */
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** Gives the money back, e.g. when the order couldn't be saved after charging. */
  refund(reference: string): Promise<void>;
}

/** Card number that the mock provider always declines, for testing the error path. */
export const MOCK_DECLINED_CARD = "4000000000000002";

export function createMockPaymentProvider(): PaymentProvider {
  return {
    async charge({ payment }) {
      if (payment.method !== "mock") return { ok: false, reason: "Unsupported payment method" };
      if (payment.cardNumber === MOCK_DECLINED_CARD) return { ok: false, reason: "Card declined" };
      return { ok: true, reference: `mock_${randomBytes(9).toString("base64url")}` };
    },
    async refund() {
      // Nothing to do: no real money moved.
    },
  };
}
