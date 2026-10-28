import {
  createCafeRequestSchema,
  idSchema,
  resetCafePasswordRequestSchema,
  updateCafeRequestSchema,
  type AdminCafesResponse,
} from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireSuperAdmin } from "../../plugins/auth";
import type { CafesService } from "./cafes.service";

const cafeParamsSchema = z.object({ id: idSchema });

/** Super-admin café management, mounted at /api/admin. */
export const adminCafesRoutes: FastifyPluginAsync<{ cafesService: CafesService }> = async (
  app,
  { cafesService },
) => {
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

  app.post("/cafes/:id/password", async (request, reply) => {
    const { id } = cafeParamsSchema.parse(request.params);
    const { newPassword } = resetCafePasswordRequestSchema.parse(request.body);
    await cafesService.resetPassword(id, newPassword);
    return reply.code(204).send();
  });
};
