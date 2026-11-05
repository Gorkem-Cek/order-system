import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

const IMMUTABLE = "public, max-age=31536000, immutable";

/** Serves the built web app. Vite puts a content hash in every /assets file name. */
export const webRoutes = fp<{ root: string }>(async (app: FastifyInstance, { root }) => {
  await app.register(fastifyStatic, {
    root: path.resolve(root),
    preCompressed: true,
    setHeaders: (reply, file) => {
      reply.header("cache-control", /[\\/]assets[\\/]/.test(file) ? IMMUTABLE : "no-cache");
    },
  });
});

/**
 * Pages like /m/<token> only exist in the browser, so unknown page addresses get the app.
 * Missing files and API routes keep their 404, or a stale /assets request would receive HTML.
 */
export function sendsWebApp(request: FastifyRequest): boolean {
  const pathname = request.url.split("?")[0] ?? "";
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    !pathname.startsWith("/api/") &&
    pathname !== "/api" &&
    path.posix.extname(pathname) === ""
  );
}

export const sendWebApp = (reply: FastifyReply) => reply.sendFile("index.html");
