import { selectedOptionSchema, type Order } from "@siparis/shared";
import { z } from "zod";
import type { OrdersRepository } from "./orders.repository";

export type OrderRow = NonNullable<Awaited<ReturnType<OrdersRepository["findById"]>>>;

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
