import { idSchema, qrTokenSchema, type OpenWaiterCallsResponse } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "../cafes/cafes.repository";
import type { WaiterCallsService } from "./waiter-calls.service";

/** Guest side, mounted at /api/menu: POST /:qrToken/waiter-call. */
export const guestWaiterCallRoutes: FastifyPluginAsync<{
  waiterCalls: WaiterCallsService;
  rateLimit: number;
}> = async (app, { waiterCalls, rateLimit }) => {
  const paramsSchema = z.object({ qrToken: qrTokenSchema });

  app.post(
    "/:qrToken/waiter-call",
    {
      config: {
        // The 60 s cooldown is the real limit; this only stops request floods.
        rateLimit: {
          max: rateLimit,
          timeWindow: "1 minute",
          keyGenerator: (request) => `${request.ip}:${request.url}`,
        },
      },
    },
    async (request, reply) => {
      const { qrToken } = paramsSchema.parse(request.params);
      return reply.code(201).send(await waiterCalls.callWaiter(qrToken));
    },
  );
};

/** Staff side, mounted at /api/staff. */
export const staffWaiterCallRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  waiterCalls: WaiterCallsService;
}> = async (app, { cafes, waiterCalls }) => {
  app.addHook("preHandler", requireCafe(cafes));
  const paramsSchema = z.object({ id: idSchema });

  app.get("/waiter-calls", async (request): Promise<OpenWaiterCallsResponse> => ({
    calls: await waiterCalls.listOpen(cafeIdOf(request)),
  }));

  app.post("/waiter-calls/:id/resolve", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await waiterCalls.resolve(cafeIdOf(request), id);
    return reply.code(204).send();
  });
};
