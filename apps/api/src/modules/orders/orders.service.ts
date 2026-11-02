import {
  ACTIVE_ORDER_STATUSES,
  priceLine,
  selectedOptionSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  type Order,
  type OrderStatus,
} from "@siparis/shared";
import { z } from "zod";
import { businessDate } from "../../lib/business-date";
import type { EventBus } from "../../lib/event-bus";
import { AppError, notFound } from "../../lib/errors";
import type { MenuService } from "../menu/menu.service";
import type { PaymentProvider } from "../payments/payment-provider";
import { canTransition } from "./order-status";
import type { NewOrder, OrdersRepository } from "./orders.repository";

type OrderRow = NonNullable<Awaited<ReturnType<OrdersRepository["findById"]>>>;

const storedOptionsSchema = z.array(selectedOptionSchema);

export function toOrder(order: OrderRow): Order {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    tableName: order.tableName,
    status: order.status,
    note: order.note,
    totalKurus: order.totalKurus,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      unitPriceKurus: item.unitPriceKurus,
      quantity: item.quantity,
      note: item.note,
      selectedOptions: storedOptionsSchema.parse(item.selectedOptions),
    })),
  };
}

export function createOrdersService(deps: {
  orders: OrdersRepository;
  menuService: MenuService;
  payments: PaymentProvider;
  events: EventBus;
  now?: () => Date;
  log?: { error: (obj: object, msg: string) => void };
}) {
  const { orders, menuService, payments, events } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * Pay-before-send checkout: price every line from the database (client prices are never
     * trusted), charge the card, and only then create the order.
     */
    async checkout(qrToken: string, request: CheckoutRequest): Promise<CheckoutResponse> {
      const table = await menuService.resolveTable(qrToken);
      const productIds = [...new Set(request.lines.map((line) => line.productId))];
      const products = new Map(
        (await orders.findProductsForCheckout(table.cafeId, productIds)).map((p) => [p.id, p]),
      );

      const items: NewOrder["items"] = request.lines.map((line, lineIndex) => {
        const product = products.get(line.productId);
        const result = product
          ? priceLine(product, line.optionIds)
          : ({ ok: false, error: { code: "PRODUCT_NOT_FOUND" } } as const);
        if (!result.ok || !product) {
          throw new AppError(422, "INVALID_CART", "A cart line can't be ordered", {
            lineIndex,
            productId: line.productId,
            reason: result.ok ? "PRODUCT_NOT_FOUND" : result.error.code,
          });
        }
        return {
          productId: product.id,
          productName: product.name,
          unitPriceKurus: result.unitPriceKurus,
          quantity: line.quantity,
          note: line.note ?? null,
          selectedOptions: result.selectedOptions,
        };
      });
      const totalKurus = items.reduce((sum, item) => sum + item.unitPriceKurus * item.quantity, 0);

      const charge = await payments.charge({
        amountKurus: totalKurus,
        payment: request.payment,
        description: `${table.cafe.name} · ${table.name}`,
      });
      if (!charge.ok) throw new AppError(402, "PAYMENT_FAILED", charge.reason);

      let order: OrderRow;
      try {
        order = await orders.createWithNextNumber({
          cafeId: table.cafeId,
          tableId: table.id,
          tableName: table.name,
          orderDate: businessDate(now()),
          note: request.note ?? null,
          totalKurus,
          paymentRef: charge.reference,
          items,
        });
      } catch (error) {
        // The guest was charged but has no order: give the money back before failing.
        deps.log?.error({ err: error, paymentRef: charge.reference }, "Order creation failed");
        await payments.refund(charge.reference);
        throw error;
      }

      events.publish(table.cafeId, { type: "order.created", order: toOrder(order) });
      return { orderId: order.id, orderNumber: order.orderNumber, totalKurus: order.totalKurus };
    },

    /** Orders still on the live board (new and preparing), oldest first. */
    async listActive(cafeId: string): Promise<Order[]> {
      return (await orders.listByStatus(cafeId, [...ACTIVE_ORDER_STATUSES])).map(toOrder);
    },

    async updateStatus(cafeId: string, orderId: string, to: OrderStatus): Promise<Order> {
      const order = await orders.findById(cafeId, orderId);
      if (!order) throw notFound("Order");

      const invalid = () =>
        new AppError(
          409,
          "INVALID_STATUS_TRANSITION",
          `Can't move order from ${order.status} to ${to}`,
          {
            from: order.status,
            to,
          },
        );
      if (!canTransition(order.status, to)) throw invalid();
      // Someone else may have changed it in the meantime (two staff screens).
      if (!(await orders.updateStatusIf(cafeId, orderId, order.status, to))) {
        const current = await orders.findById(cafeId, orderId);
        throw new AppError(409, "INVALID_STATUS_TRANSITION", "Order was changed by someone else", {
          from: current?.status ?? order.status,
          to,
        });
      }

      const updated = await orders.findById(cafeId, orderId);
      if (!updated) throw notFound("Order");
      const result = toOrder(updated);
      events.publish(cafeId, { type: "order.updated", order: result });
      return result;
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
