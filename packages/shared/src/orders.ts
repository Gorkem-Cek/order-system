import { z } from "zod";
import { idSchema, kurusSchema } from "./common";
import { selectedOptionSchema } from "./pricing";

// Staff-side order shapes. Which transitions are allowed is decided only by the API's
// order service; the board just sends the status it wants.

export const ORDER_STATUSES = ["NEW", "PREPARING", "SERVED", "CANCELLED"] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Statuses shown on the live board; served and cancelled orders only appear in history. */
export const ACTIVE_ORDER_STATUSES = ["NEW", "PREPARING"] as const satisfies readonly OrderStatus[];

export const orderItemSchema = z.object({
  id: idSchema,
  productName: z.string(),
  unitPriceKurus: kurusSchema,
  quantity: z.int().positive(),
  note: z.string().nullable(),
  selectedOptions: z.array(selectedOptionSchema),
});

export const orderSchema = z.object({
  id: idSchema,
  orderNumber: z.int().positive(),
  tableName: z.string(),
  status: orderStatusSchema,
  note: z.string().nullable(),
  totalKurus: kurusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  items: z.array(orderItemSchema),
});

// GET /api/staff/orders — active orders for the board.
export const activeOrdersResponseSchema = z.object({ orders: z.array(orderSchema) });

// PATCH /api/staff/orders/:id/status
export const updateOrderStatusRequestSchema = z.object({
  status: z.enum(["PREPARING", "SERVED", "CANCELLED"]),
});

// GET /api/staff/orders/history?from=YYYY-MM-DD&to=YYYY-MM-DD&status=SERVED&page=1
export const orderHistoryQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: orderStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "`from` must not be after `to`",
    path: ["to"],
  });

export const orderHistoryResponseSchema = z.object({
  orders: z.array(orderSchema),
  page: z.int().min(1),
  pageSize: z.int().positive(),
  total: z.int().nonnegative(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type ActiveOrdersResponse = z.infer<typeof activeOrdersResponseSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusRequestSchema>;
export type OrderHistoryQuery = z.infer<typeof orderHistoryQuerySchema>;
export type OrderHistoryResponse = z.infer<typeof orderHistoryResponseSchema>;
