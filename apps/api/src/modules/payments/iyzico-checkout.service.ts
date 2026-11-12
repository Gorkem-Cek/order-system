import type { GuestContact, PaymentStatusResponse, PlacedOrder } from "@siparis/shared";
import type { EventBus } from "../../lib/event-bus";
import { AppError, notFound } from "../../lib/errors";
import type { SecretBox } from "../../lib/secret-box";
import { iyzicoBaseUrl } from "../cafes/cafe-payments.service";
import type { NewOrder } from "../orders/orders.repository";
import { toOrder } from "../orders/order-view";
import { IyzicoError, type IyzicoClient, type IyzicoCredentials } from "./iyzico";
import type { PaymentAttemptsRepository } from "./payment-attempts.repository";

/** A guest who hasn't finished on iyzico's page after this long has given up. */
const ABANDONED_AFTER_MS = 30 * 60_000;

type CafeKeys = {
  iyzicoMode: "SANDBOX" | "LIVE" | null;
  iyzicoApiKey: string | null;
  iyzicoSecretKey: string | null;
};

type Attempt = NonNullable<Awaited<ReturnType<PaymentAttemptsRepository["findById"]>>>;

export function createIyzicoCheckoutService(deps: {
  attempts: PaymentAttemptsRepository;
  secretBox: SecretBox | null;
  iyzico: (credentials: IyzicoCredentials) => IyzicoClient;
  events: EventBus;
  /** Web app address; iyzico sends the guest back to <publicUrl>/api/payments/iyzico/... */
  publicUrl: string;
  businessDate: () => Date;
  now?: () => Date;
  log?: { error: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}) {
  const { attempts, secretBox, iyzico, events, publicUrl } = deps;
  const now = deps.now ?? (() => new Date());

  /** The café's iyzico client, or null if it has no usable account. */
  const clientFor = (cafe: CafeKeys): IyzicoClient | null => {
    if (!secretBox || !cafe.iyzicoMode || !cafe.iyzicoApiKey || !cafe.iyzicoSecretKey) return null;
    return iyzico({
      apiKey: cafe.iyzicoApiKey,
      secretKey: secretBox.open(cafe.iyzicoSecretKey),
      baseUrl: iyzicoBaseUrl(cafe.iyzicoMode),
    });
  };

  const placed = (order: { id: string; orderNumber: number; totalKurus: number }): PlacedOrder => ({
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalKurus: order.totalKurus,
  });

  /** Voids a payment we won't turn into an order, so the guest isn't charged. */
  const cancel = async (client: IyzicoClient, attemptId: string, paymentId: string, ip: string) => {
    try {
      await client.cancelPayment(paymentId, ip, attemptId);
    } catch (error) {
      deps.log?.error({ err: error, attemptId, paymentId }, "iyzico cancel failed: refund by hand");
    }
  };

  /**
   * Asks iyzico how the attempt ended and, if it was paid, creates the order. Safe to call any
   * number of times (callback and status checks may race): at most one order is ever created.
   */
  async function confirm(attempt: Attempt, ip: string): Promise<Attempt["status"]> {
    if (attempt.status !== "PENDING") return attempt.status;
    const client = clientFor(attempt.cafe);
    if (!attempt.iyzicoToken || !client) {
      await attempts.markFailed(attempt.id, "NOT_STARTED");
      return "FAILED";
    }

    let result: Awaited<ReturnType<IyzicoClient["retrieveCheckoutForm"]>>;
    try {
      result = await client.retrieveCheckoutForm(attempt.iyzicoToken, attempt.id);
    } catch (error) {
      // iyzico refusing the lookup usually means the guest hasn't paid (yet).
      const abandoned = now().getTime() - attempt.createdAt.getTime() > ABANDONED_AFTER_MS;
      if (error instanceof IyzicoError && error.code !== undefined && abandoned) {
        await attempts.markFailed(attempt.id, `ABANDONED:${error.code}`);
        return "FAILED";
      }
      if (!(error instanceof IyzicoError && error.code !== undefined)) {
        deps.log?.warn({ err: error, attemptId: attempt.id }, "Couldn't confirm iyzico payment");
      }
      return "PENDING";
    }

    if (result.paymentStatus === "FAILURE") {
      await attempts.markFailed(attempt.id, "DECLINED");
      return "FAILED";
    }
    if (result.paymentStatus !== "SUCCESS") return "PENDING";

    const reject = async (reason: string) => {
      deps.log?.error({ attemptId: attempt.id, reason, result }, "iyzico payment rejected");
      if (result.paymentId) await cancel(client, attempt.id, result.paymentId, ip);
      await attempts.markFailed(attempt.id, reason);
      return "FAILED" as const;
    };
    // Each check guards against a payment that doesn't belong to this order.
    if (
      !result.paymentId ||
      result.basketId !== attempt.id ||
      result.conversationId !== attempt.id ||
      result.currency !== "TRY" ||
      result.paidPriceKurus !== attempt.totalKurus
    ) {
      return reject("MISMATCH");
    }
    // 0 = in review, -1 = rejected: iyzico says only to deliver when it's 1.
    if (result.fraudStatus !== 1) return reject(`FRAUD_STATUS_${result.fraudStatus}`);

    const order: NewOrder = {
      cafeId: attempt.cafeId,
      tableId: attempt.tableId,
      tableName: attempt.tableName,
      orderDate: deps.businessDate(),
      note: attempt.note,
      totalKurus: attempt.totalKurus,
      paymentRef: `iyzico:${result.paymentId}`,
      items: attempt.items as NewOrder["items"],
    };
    let created: Awaited<ReturnType<PaymentAttemptsRepository["completeWithOrder"]>>;
    try {
      created = await attempts.completeWithOrder(
        attempt.id,
        { paymentId: result.paymentId, transactions: result.transactions },
        order,
      );
    } catch (error) {
      deps.log?.error({ err: error, attemptId: attempt.id }, "Order creation failed after payment");
      return reject("ORDER_FAILED");
    }
    if (!created) return (await attempts.findById(attempt.id))?.status ?? "FAILED";

    events.publish(attempt.cafeId, { type: "order.created", order: toOrder(created) });
    return "PAID";
  }

  return {
    /** Whether the café can take iyzico payments. */
    canAccept: (cafe: CafeKeys) =>
      Boolean(secretBox && cafe.iyzicoMode && cafe.iyzicoApiKey && cafe.iyzicoSecretKey),

    /** Stores the priced order and opens iyzico's payment page for it. */
    async start(input: {
      cafe: CafeKeys & { name: string; address: string | null; city: string | null };
      table: { id: string; name: string; qrToken: string; cafeId: string };
      items: NewOrder["items"];
      totalKurus: number;
      note: string | null;
      buyer: GuestContact;
      locale: "tr" | "en";
      ip: string;
    }) {
      const client = clientFor(input.cafe);
      if (!client || !input.cafe.iyzicoMode) {
        throw new AppError(409, "PAYMENTS_NOT_SET_UP", "This café can't take payments yet");
      }
      const attempt = await attempts.create({
        cafeId: input.table.cafeId,
        tableId: input.table.id,
        tableName: input.table.name,
        qrToken: input.table.qrToken,
        note: input.note,
        totalKurus: input.totalKurus,
        items: input.items,
        iyzicoMode: input.cafe.iyzicoMode,
      });

      try {
        const page = await client.initializeCheckoutForm({
          basketId: attempt.id,
          conversationId: attempt.id,
          priceKurus: input.totalKurus,
          callbackUrl: `${publicUrl}/api/payments/iyzico/callback/${attempt.id}`,
          locale: input.locale,
          buyer: {
            id: attempt.id,
            name: input.buyer.name,
            surname: input.buyer.surname,
            email: input.buyer.email,
            gsmNumber: input.buyer.phone,
            ip: input.ip,
          },
          address: {
            contactName: input.cafe.name,
            address: input.cafe.address ?? input.cafe.name,
            city: input.cafe.city ?? "İstanbul",
          },
          // iyzico rejects zero-priced basket items; they're still part of the order.
          items: input.items
            .map((item, index) => ({
              id: `line-${index + 1}`,
              name: item.productName.slice(0, 100),
              category1: "Yiyecek ve İçecek",
              priceKurus: item.unitPriceKurus * item.quantity,
            }))
            .filter((item) => item.priceKurus > 0),
        });
        await attempts.setToken(attempt.id, page.token);
        return { paymentId: attempt.id, paymentPageUrl: page.paymentPageUrl };
      } catch (error) {
        await attempts.markFailed(attempt.id, "START_FAILED");
        deps.log?.error({ err: error, attemptId: attempt.id }, "Couldn't open iyzico payment page");
        throw new AppError(502, "PAYMENT_PROVIDER_UNAVAILABLE", "Couldn't start the payment");
      }
    },

    /**
     * iyzico sent the guest back with a token: confirm the payment, then tell the browser
     * where to go (the table's menu, which shows the result). Returns null if unknown.
     */
    async handleCallback(attemptId: string, token: string | undefined, ip: string) {
      const attempt = await attempts.findById(attemptId);
      if (!attempt) return null;
      // A token from another attempt must never confirm this one.
      if (token && attempt.iyzicoToken && token === attempt.iyzicoToken) {
        await confirm(attempt, ip);
      }
      return `/m/${attempt.qrToken}?payment=${attempt.id}`;
    },

    /** The result shown on the guest's menu; re-checks with iyzico while still pending. */
    async status(qrToken: string, attemptId: string, ip: string): Promise<PaymentStatusResponse> {
      const found = await attempts.findById(attemptId);
      if (!found || found.qrToken !== qrToken) throw notFound("Payment");
      const status = await confirm(found, ip);
      const attempt = status === found.status ? found : await attempts.findById(attemptId);
      return {
        status,
        order: status === "PAID" && attempt?.order ? placed(attempt.order) : null,
      };
    },
  };
}

export type IyzicoCheckoutService = ReturnType<typeof createIyzicoCheckoutService>;
