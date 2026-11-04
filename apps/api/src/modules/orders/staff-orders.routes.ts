import {
  idSchema,
  orderHistoryQuerySchema,
  updateOrderStatusRequestSchema,
  type ActiveOrdersResponse,
  type OrderHistoryResponse,
} from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "../cafes/cafes.repository";
import type { OrdersService } from "./orders.service";

const paramsSchema = z.object({ id: idSchema });

/** The live order board's endpoints; mounted at /api/staff. */
export const staffOrdersRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  ordersService: OrdersService;
}> = async (app, { cafes, ordersService }) => {
  app.addHook("preHandler", requireCafe(cafes));

  app.get("/orders", async (request): Promise<ActiveOrdersResponse> => ({
    orders: await ordersService.listActive(cafeIdOf(request)),
  }));

  app.get("/orders/history", async (request): Promise<OrderHistoryResponse> =>
    ordersService.listHistory(cafeIdOf(request), orderHistoryQuerySchema.parse(request.query)),
  );

  app.patch("/orders/:id/status", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { status } = updateOrderStatusRequestSchema.parse(request.body);
    return ordersService.updateStatus(cafeIdOf(request), id, status);
  });
};
