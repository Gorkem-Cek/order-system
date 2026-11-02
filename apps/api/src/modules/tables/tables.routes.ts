import { idSchema, tableInputSchema, type StaffTablesResponse } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "../cafes/cafes.repository";
import type { TablesService } from "./tables.service";

const paramsSchema = z.object({ id: idSchema });

/** Table management for café staff; mounted at /api/staff/tables. */
export const tablesRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  tables: TablesService;
}> = async (app, { cafes, tables }) => {
  app.addHook("preHandler", requireCafe(cafes));

  app.get("/", async (request): Promise<StaffTablesResponse> => ({
    tables: await tables.list(cafeIdOf(request)),
  }));

  app.post("/", async (request, reply) => {
    const { name } = tableInputSchema.parse(request.body);
    return reply.code(201).send(await tables.create(cafeIdOf(request), name));
  });

  app.patch("/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { name } = tableInputSchema.parse(request.body);
    return tables.rename(cafeIdOf(request), id, name);
  });

  app.post("/:id/qr", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return tables.regenerateQr(cafeIdOf(request), id);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await tables.delete(cafeIdOf(request), id);
    return reply.code(204).send();
  });
};
