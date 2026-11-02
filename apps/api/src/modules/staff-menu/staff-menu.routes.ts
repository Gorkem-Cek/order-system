import {
  availabilityInputSchema,
  categoryInputSchema,
  idSchema,
  productInputSchema,
  reorderRequestSchema,
  type StaffMenuResponse,
} from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "../cafes/cafes.repository";
import type { StaffMenuService } from "./staff-menu.service";

const paramsSchema = z.object({ id: idSchema });

/** Menu management for café staff; mounted at /api/staff. */
export const staffMenuRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  staffMenu: StaffMenuService;
}> = async (app, { cafes, staffMenu }) => {
  app.addHook("preHandler", requireCafe(cafes));

  app.get("/menu", async (request): Promise<StaffMenuResponse> => ({
    categories: await staffMenu.getMenu(cafeIdOf(request)),
  }));

  // Categories
  app.post("/categories", async (request, reply) => {
    const { name } = categoryInputSchema.parse(request.body);
    return reply.code(201).send(await staffMenu.createCategory(cafeIdOf(request), name));
  });

  // Registered before /categories/:id so "order" isn't taken for an id.
  app.put("/categories/order", async (request, reply) => {
    const { ids } = reorderRequestSchema.parse(request.body);
    await staffMenu.reorderCategories(cafeIdOf(request), ids);
    return reply.code(204).send();
  });

  app.patch("/categories/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { name } = categoryInputSchema.parse(request.body);
    await staffMenu.renameCategory(cafeIdOf(request), id, name);
    return reply.code(204).send();
  });

  app.delete("/categories/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await staffMenu.deleteCategory(cafeIdOf(request), id);
    return reply.code(204).send();
  });

  app.put("/categories/:id/products/order", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { ids } = reorderRequestSchema.parse(request.body);
    await staffMenu.reorderProducts(cafeIdOf(request), id, ids);
    return reply.code(204).send();
  });

  // Products
  app.post("/products", async (request, reply) => {
    const input = productInputSchema.parse(request.body);
    return reply.code(201).send(await staffMenu.createProduct(cafeIdOf(request), input));
  });

  app.put("/products/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return staffMenu.updateProduct(cafeIdOf(request), id, productInputSchema.parse(request.body));
  });

  app.patch("/products/:id/availability", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { isAvailable } = availabilityInputSchema.parse(request.body);
    return staffMenu.setAvailability(cafeIdOf(request), id, isAvailable);
  });

  app.delete("/products/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await staffMenu.deleteProduct(cafeIdOf(request), id);
    return reply.code(204).send();
  });
};
