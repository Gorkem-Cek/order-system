import type { FastifyPluginAsync } from "fastify";
import { notFound } from "../lib/errors";
import type { LocalStorage } from "../lib/storage";

/** Serves locally stored uploads at /uploads/<key>. Keys are unique, so they never change. */
export const uploadsRoutes: FastifyPluginAsync<{ storage: LocalStorage }> = async (
  app,
  { storage },
) => {
  app.get("/*", async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    const file = await storage.open(key);
    if (!file) throw notFound("File");
    return reply
      .header("content-type", "image/webp")
      .header("content-length", file.size)
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("x-content-type-options", "nosniff")
      .send(file.stream);
  });
};
