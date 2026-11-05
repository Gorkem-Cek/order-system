import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** The visitor's address, for rate limits. Use this instead of `request.ip`. */
    clientIp: string;
  }
}

/**
 * Behind a proxy every connection comes from the proxy, so the visitor's address has to come from
 * the header the proxy sets (`header`). Without one, it's the address of the connection itself.
 */
export function decorateClientIp(app: FastifyInstance, header: string | undefined) {
  app.decorateRequest("clientIp", {
    getter() {
      const value = header ? this.headers[header] : undefined;
      return (typeof value === "string" && value.trim()) || this.ip;
    },
  });
}
