import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// A small client for the parts of iyzico's API we use: the hosted Checkout Form, and cancel /
// refund. Card details never pass through it; guests type them on iyzico's page.
// Docs: https://docs.iyzico.com/en/payment-methods/checkoutform

export const IYZICO_SANDBOX_URL = "https://sandbox-api.iyzipay.com";
export const IYZICO_LIVE_URL = "https://api.iyzipay.com";

export type IyzicoCredentials = { apiKey: string; secretKey: string; baseUrl: string };

/** iyzico answered with `status: "failure"`, or couldn't be reached or understood. */
export class IyzicoError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "IyzicoError";
  }
}

/** Kuruş → iyzico's decimal string without trailing zeros: 4000 → "40", 4050 → "40.5". */
export function formatPrice(kurus: number): string {
  if (!Number.isInteger(kurus) || kurus < 0) throw new Error(`Invalid amount: ${kurus}`);
  const lira = Math.floor(kurus / 100);
  const rest = String(kurus % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return rest ? `${lira}.${rest}` : String(lira);
}

/** An iyzico decimal ("40.50", "40.5", "40") → kuruş, or null if it isn't one. */
export function parsePrice(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d+(\.\d+)?$/.test(text)) return null;
  const [lira = "0", fraction = ""] = text.split(".");
  if (/[1-9]/.test(fraction.slice(2))) return null; // finer than a kuruş
  return Number(lira) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
}

/** iyzico hashes prices without trailing zeros, so "40.50" becomes "40.5". */
const signaturePrice = (value: unknown) => {
  const kurus = parsePrice(value);
  return kurus === null ? String(value) : formatPrice(kurus);
};

const hmacHex = (secretKey: string, data: string) =>
  createHmac("sha256", secretKey).update(data).digest("hex");

/** The `Authorization` header (IYZWSv2): an HMAC of the random key, path and body. */
export function authorizationHeader(
  { apiKey, secretKey }: Pick<IyzicoCredentials, "apiKey" | "secretKey">,
  randomKey: string,
  path: string,
  body: string,
): string {
  const signature = hmacHex(secretKey, randomKey + path + body);
  const value = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return `IYZWSv2 ${Buffer.from(value).toString("base64")}`;
}

export type BasketItem = { id: string; name: string; category1: string; priceKurus: number };

export type CheckoutFormRequest = {
  /** Our reference for this payment; iyzico returns it in the result. */
  basketId: string;
  conversationId: string;
  priceKurus: number;
  /** Where iyzico sends the guest (with a token) when the payment ends. Must be HTTPS. */
  callbackUrl: string;
  locale: "tr" | "en";
  buyer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    gsmNumber: string;
    ip: string;
  };
  /** The café's address, used for the buyer and billing address fields. */
  address: { contactName: string; address: string; city: string };
  items: BasketItem[];
};

export type CheckoutFormResult = {
  paymentStatus: string;
  paymentId: string | null;
  basketId: string;
  conversationId: string;
  paidPriceKurus: number | null;
  currency: string;
  fraudStatus: number | null;
  /** Needed to refund each basket item. */
  transactions: { itemId: string; paymentTransactionId: string; paidPriceKurus: number | null }[];
};

type Fetch = typeof fetch;

export function createIyzicoClient(
  credentials: IyzicoCredentials,
  options: { fetch?: Fetch; randomKey?: () => string; timeoutMs?: number } = {},
) {
  const doFetch = options.fetch ?? fetch;
  const newRandomKey = options.randomKey ?? (() => randomBytes(12).toString("hex"));
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function post(path: string, payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    const randomKey = newRandomKey();
    let response: Response;
    try {
      response = await doFetch(credentials.baseUrl + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-iyzi-rnd": randomKey,
          authorization: authorizationHeader(credentials, randomKey, path, body),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new IyzicoError(`iyzico unreachable: ${(error as Error).message}`);
    }
    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new IyzicoError(`iyzico sent an unreadable response (HTTP ${response.status})`);
    }
    if (data["status"] !== "success") {
      throw new IyzicoError(
        String(data["errorMessage"] ?? `iyzico request failed (HTTP ${response.status})`),
        data["errorCode"] === undefined ? undefined : String(data["errorCode"]),
      );
    }
    return data;
  }

  return {
    /** Starts a payment on iyzico's hosted page; send the guest to `paymentPageUrl`. */
    async initializeCheckoutForm(request: CheckoutFormRequest) {
      const total = request.items.reduce((sum, item) => sum + item.priceKurus, 0);
      if (total !== request.priceKurus) {
        throw new Error("Basket items must add up to the price");
      }
      const address = {
        contactName: request.address.contactName,
        address: request.address.address,
        city: request.address.city,
        country: "Turkey",
      };
      const data = await post("/payment/iyzipos/checkoutform/initialize/auth/ecom", {
        locale: request.locale,
        conversationId: request.conversationId,
        price: formatPrice(request.priceKurus),
        paidPrice: formatPrice(request.priceKurus),
        currency: "TRY",
        basketId: request.basketId,
        paymentGroup: "PRODUCT",
        callbackUrl: request.callbackUrl,
        enabledInstallments: [1],
        buyer: {
          ...request.buyer,
          // Guests aren't asked for their national ID number or home address.
          identityNumber: "11111111111",
          registrationAddress: address.address,
          city: address.city,
          country: address.country,
        },
        shippingAddress: address,
        billingAddress: address,
        basketItems: request.items.map((item) => ({
          id: item.id,
          name: item.name,
          category1: item.category1,
          itemType: "PHYSICAL",
          price: formatPrice(item.priceKurus),
        })),
      });
      const token = data["token"];
      const paymentPageUrl = data["paymentPageUrl"];
      if (typeof token !== "string" || typeof paymentPageUrl !== "string") {
        throw new IyzicoError("iyzico didn't return a payment page");
      }
      return { token, paymentPageUrl };
    },

    /**
     * Asks iyzico how the payment behind a callback token ended. The response signature is
     * checked, so a forged or altered answer is rejected.
     */
    async retrieveCheckoutForm(token: string, conversationId: string): Promise<CheckoutFormResult> {
      const data = await post("/payment/iyzipos/checkoutform/auth/ecom/detail", {
        locale: "tr",
        conversationId,
        token,
      });
      const signed = [
        data["paymentStatus"],
        data["paymentId"],
        data["currency"],
        data["basketId"],
        data["conversationId"],
        signaturePrice(data["paidPrice"]),
        signaturePrice(data["price"]),
        data["token"],
      ].join(":");
      if (!signatureMatches(credentials.secretKey, signed, data["signature"])) {
        throw new IyzicoError("iyzico response signature doesn't match");
      }
      const items = Array.isArray(data["itemTransactions"]) ? data["itemTransactions"] : [];
      return {
        paymentStatus: String(data["paymentStatus"]),
        paymentId: data["paymentId"] ? String(data["paymentId"]) : null,
        basketId: String(data["basketId"]),
        conversationId: String(data["conversationId"]),
        paidPriceKurus: parsePrice(data["paidPrice"]),
        currency: String(data["currency"]),
        fraudStatus: typeof data["fraudStatus"] === "number" ? data["fraudStatus"] : null,
        transactions: items.map((item: Record<string, unknown>) => ({
          itemId: String(item["itemId"]),
          paymentTransactionId: String(item["paymentTransactionId"]),
          paidPriceKurus: parsePrice(item["paidPrice"]),
        })),
      };
    },

    /** Voids a whole payment. Banks usually allow this only on the day of the payment. */
    async cancelPayment(paymentId: string, ip: string, conversationId: string) {
      await post("/payment/cancel", { locale: "tr", conversationId, paymentId, ip });
    },

    /** Refunds (part of) one basket item's transaction, for up to a year. */
    async refundTransaction(
      paymentTransactionId: string,
      amountKurus: number,
      ip: string,
      conversationId: string,
    ) {
      await post("/payment/refund", {
        locale: "tr",
        conversationId,
        paymentTransactionId,
        price: formatPrice(amountKurus),
        currency: "TRY",
        ip,
      });
    },
  };
}

function signatureMatches(secretKey: string, signed: string, received: unknown): boolean {
  if (typeof received !== "string" || !/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = Buffer.from(hmacHex(secretKey, signed), "hex");
  return timingSafeEqual(expected, Buffer.from(received, "hex"));
}

export type IyzicoClient = ReturnType<typeof createIyzicoClient>;
