import { checkoutRequestSchema, qrTokenSchema } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { OrdersService } from "../orders/orders.service";
import type { MenuService } from "./menu.service";

const paramsSchema = z.object({ qrToken: qrTokenSchema });

/** Public guest endpoints, reached by scanning a table's QR code; mounted at /api/menu. */
export const menuRoutes: FastifyPluginAsync<{
  menuService: MenuService;
  ordersService: OrdersService;
  checkoutRateLimit: number;
}> = async (app, { menuService, ordersService, checkoutRateLimit }) => {
  app.get("/:qrToken", async (request) => {
    const { qrToken } = paramsSchema.parse(request.params);
    return menuService.getMenu(qrToken);
  });

  app.post(
    "/:qrToken/checkout",
    {
      config: {
        rateLimit: {
          max: checkoutRateLimit,
          timeWindow: "1 minute",
          // Guests of one café often share an IP (café Wi-Fi), so limit per table too.
          keyGenerator: (request) => `${request.ip}:${request.url}`,
        },
      },
    },
    async (request, reply) => {
      const { qrToken } = paramsSchema.parse(request.params);
      const body = checkoutRequestSchema.parse(request.body);
      return reply.code(201).send(await ordersService.checkout(qrToken, body));
    },
  );
};
