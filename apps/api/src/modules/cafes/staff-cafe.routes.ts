import type { FastifyPluginAsync } from "fastify";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "./cafes.repository";
import type { CafesService } from "./cafes.service";

/** The café a staff user (or a super-admin acting as one) is managing; mounted at /api/staff. */
export const staffCafeRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  cafesService: CafesService;
}> = async (app, { cafes, cafesService }) => {
  app.addHook("preHandler", requireCafe(cafes));

  app.get("/cafe", async (request) => cafesService.getForStaff(cafeIdOf(request)));
};
