import { idSchema } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { IyzicoCheckoutService } from "./iyzico-checkout.service";

const paramsSchema = z.object({ paymentId: idSchema });
const tokenOf = (body: unknown) => {
  const token = (body as { token?: unknown } | null)?.token;
  return typeof token === "string" && token.length <= 200 ? token : undefined;
};

/**
 * Where iyzico sends the guest's browser after the payment page; mounted at
 * /api/payments/iyzico. The token is only a pointer: the result is fetched from iyzico itself.
 */
export const iyzicoRoutes: FastifyPluginAsync<{ iyzicoCheckout: IyzicoCheckoutService }> = async (
  app,
  { iyzicoCheckout },
) => {
  // iyzico posts the token as a form field; accept JSON too in case that changes.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 10_000 },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
  );

  app.post("/callback/:paymentId", async (request, reply) => {
    const { paymentId } = paramsSchema.parse(request.params);
    const target = await iyzicoCheckout.handleCallback(
      paymentId,
      tokenOf(request.body),
      request.clientIp,
    );
    // 303 turns iyzico's POST into a normal page load of the guest's menu.
    return reply.redirect(target ?? "/", 303);
  });

  // Without a token (e.g. a reload), send the guest to the menu, which checks the result.
  app.get("/callback/:paymentId", async (request, reply) => {
    const { paymentId } = paramsSchema.parse(request.params);
    return reply.redirect(
      (await iyzicoCheckout.handleCallback(paymentId, undefined, request.clientIp)) ?? "/",
      303,
    );
  });
};
