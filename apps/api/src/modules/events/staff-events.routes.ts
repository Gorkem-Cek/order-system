import { STAFF_EVENTS_READY } from "@siparis/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";
import type { EventBus } from "../../lib/event-bus";
import { cafeIdOf, requireCafe } from "../../plugins/auth";
import type { CafesRepository } from "../cafes/cafes.repository";

/** Live staff board stream (Server-Sent Events); mounted at /api/staff. */
export const staffEventsRoutes: FastifyPluginAsync<{
  cafes: CafesRepository;
  events: EventBus;
  heartbeatMs?: number;
}> = async (app, { cafes, events, heartbeatMs = 25_000 }) => {
  const open = new Set<ServerResponse>();
  // Streams never end on their own, so end them when the server shuts down.
  app.addHook("onClose", async () => {
    for (const res of open) res.end();
  });

  app.get("/events", { preHandler: requireCafe(cafes) }, (request, reply) => {
    const cafeId = cafeIdOf(request);
    const res = reply.raw;
    // Keeps headers set earlier in the request, e.g. a renewed session cookie.
    const earlier = Object.entries(reply.getHeaders()).filter(
      (entry): entry is [string, string | number | string[]] => entry[1] !== undefined,
    );
    reply.hijack();
    res.writeHead(200, {
      ...Object.fromEntries(earlier),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Stop proxies (nginx, Railway's edge) from buffering the stream.
      "x-accel-buffering": "no",
    });

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    res.write("retry: 3000\n\n");
    send(STAFF_EVENTS_READY, {});
    const unsubscribe = events.subscribe(cafeId, (event) => send(event.type, event));
    // Comment lines keep idle connections from being closed by proxies.
    const heartbeat = setInterval(() => res.write(": ping\n\n"), heartbeatMs);
    open.add(res);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      open.delete(res);
    });
  });
};
