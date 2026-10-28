import type { MockPayment } from "@siparis/shared";
import { describe, expect, it } from "vitest";
import { createMockPaymentProvider, MOCK_DECLINED_CARD } from "./payment-provider";

const payment: MockPayment = {
  method: "mock",
  cardHolder: "Ayşe Yılmaz",
  cardNumber: "4242424242424242",
  expiry: "12/29",
  cvc: "123",
};

describe("mock payment provider", () => {
  const provider = createMockPaymentProvider();

  it("approves cards and returns a unique reference", async () => {
    const first = await provider.charge({ amountKurus: 1000, payment, description: "Test" });
    const second = await provider.charge({ amountKurus: 1000, payment, description: "Test" });
    expect(first).toMatchObject({ ok: true, reference: expect.stringMatching(/^mock_/) });
    expect(first).not.toEqual(second);
  });

  it("declines the test card", async () => {
    const result = await provider.charge({
      amountKurus: 1000,
      payment: { ...payment, cardNumber: MOCK_DECLINED_CARD },
      description: "Test",
    });
    expect(result).toEqual({ ok: false, reason: "Card declined" });
  });
});
