import { qrTokenSchema } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { MenuService } from "./menu.service";

const paramsSchema = z.object({ qrToken: qrTokenSchema });

/** Public guest endpoints, reached by scanning a table's QR code; mounted at /api/menu. */
export const menuRoutes: FastifyPluginAsync<{ menuService: MenuService }> = async (
  app,
  { menuService },
) => {
  app.get("/:qrToken", async (request) => {
    const { qrToken } = paramsSchema.parse(request.params);
    return menuService.getMenu(qrToken);
  });
};
