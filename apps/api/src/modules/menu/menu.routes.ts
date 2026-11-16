import { checkoutRequestSchema, idSchema, qrTokenSchema } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { OrdersService } from "../orders/orders.service";
import type { IyzicoCheckoutService } from "../payments/iyzico-checkout.service";
import type { MenuService } from "./menu.service";

const paramsSchema = z.object({ qrToken: qrTokenSchema });

/** Public guest endpoints, reached by scanning a table's QR code; mounted at /api/menu. */
export const menuRoutes: FastifyPluginAsync<{
  menuService: MenuService;
  ordersService: OrdersService;
  iyzicoCheckout: IyzicoCheckoutService;
  checkoutRateLimit: number;
}> = async (app, { menuService, ordersService, iyzicoCheckout, checkoutRateLimit }) => {
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
          keyGenerator: (request) => `${request.clientIp}:${request.url}`,
        },
      },
    },
    async (request, reply) => {
      const { qrToken } = paramsSchema.parse(request.params);
      const body = checkoutRequestSchema.parse(request.body);
      const result = await ordersService.checkout(qrToken, body, { ip: request.clientIp });
      return reply.code(result.kind === "paid" ? 201 : 200).send(result);
    },
  );

  // The guest's menu asks this after coming back from iyzico's payment page.
  app.get(
    "/:qrToken/payments/:paymentId",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { qrToken, paymentId } = paramsSchema
        .extend({ paymentId: idSchema })
        .parse(request.params);
      return iyzicoCheckout.status(qrToken, paymentId, request.clientIp);
    },
  );
};
