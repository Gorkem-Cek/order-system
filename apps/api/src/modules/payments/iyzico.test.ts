import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createIyzicoClient,
  formatPrice,
  IYZICO_SANDBOX_URL,
  IyzicoError,
  parsePrice,
  type CheckoutFormRequest,
} from "./iyzico";

const credentials = {
  apiKey: "sandbox-api-key",
  secretKey: "sandbox-secret-key",
  baseUrl: IYZICO_SANDBOX_URL,
};
const hmac = (data: string) =>
  createHmac("sha256", credentials.secretKey).update(data).digest("hex");

/** A stand-in for iyzico that records requests and answers with the given bodies. */
function fakeIyzico(...responses: (Record<string, unknown> | string)[]) {
  const requests: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    requests.push({
      url,
      headers: init.headers as Record<string, string>,
      body: String(init.body),
    });
    const next = responses.shift();
    return new Response(typeof next === "string" ? next : JSON.stringify(next), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const checkout: CheckoutFormRequest = {
  basketId: "cmatt00000000000000000001",
  conversationId: "cmatt00000000000000000001",
  priceKurus: 23500,
  callbackUrl: "https://siparis.example/api/payments/iyzico/callback",
  locale: "tr",
  buyer: {
    id: "guest-1",
    name: "Ayşe",
    surname: "Yılmaz",
    email: "ayse@example.com",
    gsmNumber: "+905551112233",
    ip: "203.0.113.7",
  },
  address: { contactName: "Köşe Kahve", address: "Moda Cad. 1", city: "İstanbul" },
  items: [
    { id: "line-1", name: "Latte", category1: "İçecekler", priceKurus: 19500 },
    { id: "line-2", name: "Çay", category1: "İçecekler", priceKurus: 4000 },
  ],
};

describe("prices", () => {
  it("formats kuruş the way iyzico expects", () => {
    expect(formatPrice(4000)).toBe("40");
    expect(formatPrice(4050)).toBe("40.5");
    expect(formatPrice(4055)).toBe("40.55");
    expect(formatPrice(5)).toBe("0.05");
    expect(() => formatPrice(10.5)).toThrow();
  });

  it("parses iyzico's decimals exactly, never through floats", () => {
    expect(parsePrice("40.50")).toBe(4050);
    expect(parsePrice("40.5")).toBe(4050);
    expect(parsePrice("40")).toBe(4000);
    expect(parsePrice(40.5)).toBe(4050);
    expect(parsePrice("0.29")).toBe(29);
    expect(parsePrice("40.505")).toBeNull();
    expect(parsePrice("40.500")).toBe(4050);
    expect(parsePrice("-1")).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe("iyzico client", () => {
  it("signs requests with the IYZWSv2 header", async () => {
    const iyzico = fakeIyzico({ status: "success", token: "t", paymentPageUrl: "https://p" });
    const client = createIyzicoClient(credentials, {
      fetch: iyzico.fetch,
      randomKey: () => "random123",
    });
    await client.initializeCheckoutForm(checkout);

    const [request] = iyzico.requests;
    const path = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
    expect(request?.url).toBe(IYZICO_SANDBOX_URL + path);
    expect(request?.headers["x-iyzi-rnd"]).toBe("random123");
    const [scheme, encoded] = (request?.headers["authorization"] ?? "").split(" ");
    expect(scheme).toBe("IYZWSv2");
    expect(Buffer.from(encoded ?? "", "base64").toString()).toBe(
      `apiKey:sandbox-api-key&randomKey:random123&signature:${hmac(`random123${path}${request?.body}`)}`,
    );
  });

  it("starts a checkout form with the guest's details and placeholders for the rest", async () => {
    const iyzico = fakeIyzico({
      status: "success",
      token: "tok-1",
      paymentPageUrl: "https://sandbox-cpp.iyzipay.com?token=tok-1",
    });
    const client = createIyzicoClient(credentials, { fetch: iyzico.fetch });
    expect(await client.initializeCheckoutForm(checkout)).toEqual({
      token: "tok-1",
      paymentPageUrl: "https://sandbox-cpp.iyzipay.com?token=tok-1",
    });

    const body = JSON.parse(iyzico.requests[0]?.body ?? "{}");
    expect(body).toMatchObject({
      price: "235",
      paidPrice: "235",
      currency: "TRY",
      basketId: checkout.basketId,
      callbackUrl: checkout.callbackUrl,
      enabledInstallments: [1],
      buyer: {
        name: "Ayşe",
        email: "ayse@example.com",
        gsmNumber: "+905551112233",
        identityNumber: "11111111111",
        registrationAddress: "Moda Cad. 1",
        city: "İstanbul",
        country: "Turkey",
      },
      billingAddress: { contactName: "Köşe Kahve", city: "İstanbul", country: "Turkey" },
      basketItems: [
        { id: "line-1", price: "195", itemType: "PHYSICAL" },
        { id: "line-2", price: "40", itemType: "PHYSICAL" },
      ],
    });
    // No card data is ever part of our requests.
    expect(iyzico.requests[0]?.body).not.toMatch(/card/i);
  });

  it("refuses a basket that doesn't add up to the price", async () => {
    const client = createIyzicoClient(credentials, { fetch: fakeIyzico().fetch });
    await expect(client.initializeCheckoutForm({ ...checkout, priceKurus: 100 })).rejects.toThrow(
      /add up/,
    );
  });

  it("reports iyzico's error code and message", async () => {
    const iyzico = fakeIyzico({ status: "failure", errorCode: "1001", errorMessage: "Bad key" });
    const client = createIyzicoClient(credentials, { fetch: iyzico.fetch });
    const error = await client.initializeCheckoutForm(checkout).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IyzicoError);
    expect(error).toMatchObject({ code: "1001", message: "Bad key" });
  });

  it("treats unreadable answers and network failures as errors", async () => {
    const garbled = createIyzicoClient(credentials, { fetch: fakeIyzico("<html>").fetch });
    await expect(garbled.initializeCheckoutForm(checkout)).rejects.toBeInstanceOf(IyzicoError);

    const down = createIyzicoClient(credentials, {
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(down.cancelPayment("1", "203.0.113.7", "c")).rejects.toThrow(/unreachable/);
  });

  describe("retrieving a payment", () => {
    const result = {
      status: "success",
      paymentStatus: "SUCCESS",
      paymentId: "22416032",
      currency: "TRY",
      basketId: "cmatt00000000000000000001",
      conversationId: "cmatt00000000000000000001",
      paidPrice: "235.00",
      price: "235.0",
      token: "tok-1",
      fraudStatus: 1,
      itemTransactions: [
        { itemId: "line-1", paymentTransactionId: "1001", paidPrice: "195.0" },
        { itemId: "line-2", paymentTransactionId: "1002", paidPrice: "40.0" },
      ],
    };
    // iyzico signs the fields in this order, with prices' trailing zeros removed.
    const signature = hmac(
      "SUCCESS:22416032:TRY:cmatt00000000000000000001:cmatt00000000000000000001:235:235:tok-1",
    );

    it("returns the result when the signature matches", async () => {
      const iyzico = fakeIyzico({ ...result, signature });
      const client = createIyzicoClient(credentials, { fetch: iyzico.fetch });
      expect(await client.retrieveCheckoutForm("tok-1", result.conversationId)).toEqual({
        paymentStatus: "SUCCESS",
        paymentId: "22416032",
        basketId: result.basketId,
        conversationId: result.conversationId,
        paidPriceKurus: 23500,
        currency: "TRY",
        fraudStatus: 1,
        transactions: [
          { itemId: "line-1", paymentTransactionId: "1001", paidPriceKurus: 19500 },
          { itemId: "line-2", paymentTransactionId: "1002", paidPriceKurus: 4000 },
        ],
      });
      expect(JSON.parse(iyzico.requests[0]?.body ?? "{}")).toMatchObject({ token: "tok-1" });
    });

    it("rejects an altered answer or a missing signature", async () => {
      for (const forged of [
        { ...result, signature, paidPrice: "1.00" },
        { ...result, signature, paymentStatus: "SUCCESS ", basketId: "other" },
        { ...result, signature: hmac("something else") },
        { ...result },
      ]) {
        const client = createIyzicoClient(credentials, { fetch: fakeIyzico(forged).fetch });
        await expect(client.retrieveCheckoutForm("tok-1", "c")).rejects.toThrow(/signature/);
      }
    });
  });

  it("cancels a payment and refunds a transaction", async () => {
    const iyzico = fakeIyzico({ status: "success" }, { status: "success" });
    const client = createIyzicoClient(credentials, { fetch: iyzico.fetch });
    await client.cancelPayment("22416032", "203.0.113.7", "conv");
    await client.refundTransaction("1001", 4050, "203.0.113.7", "conv");

    expect(iyzico.requests.map((r) => r.url.replace(IYZICO_SANDBOX_URL, ""))).toEqual([
      "/payment/cancel",
      "/payment/refund",
    ]);
    expect(JSON.parse(iyzico.requests[0]?.body ?? "{}")).toMatchObject({ paymentId: "22416032" });
    expect(JSON.parse(iyzico.requests[1]?.body ?? "{}")).toMatchObject({
      paymentTransactionId: "1001",
      price: "40.5",
      currency: "TRY",
    });
  });
});
