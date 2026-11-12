import {
  createCafeRequestSchema,
  idSchema,
  resetCafePasswordRequestSchema,
  updateCafePaymentRequestSchema,
  updateCafeRequestSchema,
  type AdminCafesResponse,
} from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireSuperAdmin } from "../../plugins/auth";
import type { CafePaymentsService } from "./cafe-payments.service";
import type { CafesService } from "./cafes.service";

const cafeParamsSchema = z.object({ id: idSchema });

/** Super-admin café management, mounted at /api/admin. */
export const adminCafesRoutes: FastifyPluginAsync<{
  cafesService: CafesService;
  cafePayments: CafePaymentsService;
}> = async (app, { cafesService, cafePayments }) => {
  app.addHook("preHandler", requireSuperAdmin);

  app.get("/cafes", async (): Promise<AdminCafesResponse> => ({
    cafes: await cafesService.list(),
  }));

  app.post("/cafes", async (request, reply) => {
    const cafe = await cafesService.create(createCafeRequestSchema.parse(request.body));
    return reply.code(201).send(cafe);
  });

  app.patch("/cafes/:id", async (request) => {
    const { id } = cafeParamsSchema.parse(request.params);
    return cafesService.update(id, updateCafeRequestSchema.parse(request.body));
  });

  // The café's iyzico account. Only the super-admin can see or change where payments go.
  app.get("/cafes/:id/payment", async (request) => {
    const { id } = cafeParamsSchema.parse(request.params);
    return cafePayments.get(id);
  });

  app.put("/cafes/:id/payment", async (request) => {
    const { id } = cafeParamsSchema.parse(request.params);
    return cafePayments.update(id, updateCafePaymentRequestSchema.parse(request.body));
  });

  app.delete("/cafes/:id/payment", async (request, reply) => {
    const { id } = cafeParamsSchema.parse(request.params);
    await cafePayments.removeKeys(id);
    return reply.code(204).send();
  });

  app.post("/cafes/:id/password", async (request, reply) => {
    const { id } = cafeParamsSchema.parse(request.params);
    const { newPassword } = resetCafePasswordRequestSchema.parse(request.body);
    await cafesService.resetPassword(id, newPassword);
    return reply.code(204).send();
  });
};
