import { cafeImageKindSchema, updateCafeSettingsRequestSchema } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "./cafes.repository";
import type { CafesService } from "./cafes.service";

const imageParamsSchema = z.object({ kind: cafeImageKindSchema });

/** The café a staff user (or a super-admin acting as one) is managing; mounted at /api/staff. */
export const staffCafeRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  cafesService: CafesService;
}> = async (app, { cafes, cafesService }) => {
  app.addHook("preHandler", requireCafe(cafes));

  app.get("/cafe", async (request) => cafesService.getForStaff(cafeIdOf(request)));

  app.patch("/cafe", async (request) =>
    cafesService.updateSettings(
      cafeIdOf(request),
      updateCafeSettingsRequestSchema.parse(request.body),
    ),
  );

  // multipart/form-data with one file field; size is limited by the multipart plugin.
  app.post("/cafe/images/:kind", async (request) => {
    const { kind } = imageParamsSchema.parse(request.params);
    const file = await request.file();
    if (!file) throw new AppError(400, "VALIDATION_FAILED", "Send one image file");
    return cafesService.setImage(cafeIdOf(request), kind, await file.toBuffer());
  });

  app.delete("/cafe/images/:kind", async (request) => {
    const { kind } = imageParamsSchema.parse(request.params);
    return cafesService.removeImage(cafeIdOf(request), kind);
  });
};
