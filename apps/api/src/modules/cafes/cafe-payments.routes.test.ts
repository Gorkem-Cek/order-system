import { cafePaymentSettingsSchema } from "@siparis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase } from "../../test/helpers";

const GOOD_API_KEY = "sandbox-good-api-key";
const SECRET = "sandbox-secret-key-123";

/** A fake iyzico that accepts only GOOD_API_KEY, and fails to answer for "offline" keys. */
const calls: { url: string; apiKey: string }[] = [];
const iyzicoFetch = (async (url: string, init: RequestInit) => {
  const header = String((init.headers as Record<string, string>)["authorization"]);
  const decoded = Buffer.from(header.replace("IYZWSv2 ", ""), "base64").toString();
  const apiKey = decoded.match(/^apiKey:([^&]+)&/)?.[1] ?? "";
  calls.push({ url, apiKey });
  if (apiKey.startsWith("offline")) throw new TypeError("fetch failed");
  const body =
    apiKey === GOOD_API_KEY
      ? { status: "success", binNumber: "552879" }
      : { status: "failure", errorCode: "1001", errorMessage: "api bilgileri bulunamadı" };
  return new Response(JSON.stringify(body));
}) as typeof fetch;

describe.skipIf(!hasDatabase)("café payment settings (super-admin)", () => {
  const ctx = createTestContext({}, { iyzicoFetch });
  let adminCookie = "";
  beforeAll(async () => {
    adminCookie = await ctx.login((await ctx.createSuperAdmin()).email);
  });
  afterAll(() => ctx.cleanup());

  const send = (
    method: "GET" | "PUT" | "DELETE",
    cafeId: string,
    payload?: object,
    cookie = adminCookie,
  ) =>
    ctx.app.inject({
      method,
      url: `/api/admin/cafes/${cafeId}/payment`,
      headers: { cookie },
      ...(payload && { payload }),
    });
  const settings = {
    mode: "SANDBOX",
    address: "Moda Cad. No 1, Kadıköy",
    city: "İstanbul",
    apiKey: GOOD_API_KEY,
    secretKey: SECRET,
  };

  it("checks the keys with iyzico, then stores the secret encrypted", async () => {
    const { cafe } = await ctx.createCafe();
    expect(cafePaymentSettingsSchema.parse((await send("GET", cafe.id)).json())).toEqual({
      mode: null,
      apiKeyEnding: null,
      address: null,
      city: null,
    });

    calls.length = 0;
    const res = await send("PUT", cafe.id, settings);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      mode: "SANDBOX",
      apiKeyEnding: "-key",
      address: "Moda Cad. No 1, Kadıköy",
      city: "İstanbul",
    });
    expect(calls).toEqual([
      { url: "https://sandbox-api.iyzipay.com/payment/bin/check", apiKey: GOOD_API_KEY },
    ]);
    // The secret key is neither returned nor stored readably.
    expect(res.body).not.toContain(SECRET);
    const row = await ctx.prisma.cafe.findUnique({ where: { id: cafe.id } });
    expect(row?.iyzicoSecretKey).toMatch(/^v1\./);
    expect(row?.iyzicoSecretKey).not.toContain(SECRET);

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/admin/cafes",
      headers: { cookie: adminCookie },
    });
    expect(list.json().cafes).toContainEqual(
      expect.objectContaining({ id: cafe.id, paymentMode: "SANDBOX" }),
    );
  });

  it("checks live keys against iyzico's live system", async () => {
    const { cafe } = await ctx.createCafe();
    calls.length = 0;
    await send("PUT", cafe.id, { ...settings, mode: "LIVE" });
    expect(calls[0]?.url).toBe("https://api.iyzipay.com/payment/bin/check");
  });

  it("refuses keys iyzico rejects, and says when iyzico can't be reached", async () => {
    const { cafe } = await ctx.createCafe();
    const rejected = await send("PUT", cafe.id, { ...settings, apiKey: "sandbox-wrong-api-key" });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toMatchObject({
      code: "PAYMENT_KEYS_REJECTED",
      details: { iyzicoCode: "1001" },
    });

    const offline = await send("PUT", cafe.id, { ...settings, apiKey: "offline-api-key-1" });
    expect(offline.statusCode).toBe(502);
    expect(offline.json().error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    expect((await ctx.prisma.cafe.findUnique({ where: { id: cafe.id } }))?.iyzicoApiKey).toBeNull();
  });

  it("keeps the saved keys when only the address changes; switching mode needs new keys", async () => {
    const { cafe } = await ctx.createCafe();
    await send("PUT", cafe.id, settings);
    const before = await ctx.prisma.cafe.findUnique({ where: { id: cafe.id } });

    calls.length = 0;
    const res = await send("PUT", cafe.id, {
      mode: "SANDBOX",
      address: "Yeni Sok. 5",
      city: "İzmir",
    });
    expect(res.json()).toMatchObject({ mode: "SANDBOX", apiKeyEnding: "-key", city: "İzmir" });
    expect(calls).toEqual([]);
    const after = await ctx.prisma.cafe.findUnique({ where: { id: cafe.id } });
    expect(after?.iyzicoSecretKey).toBe(before?.iyzicoSecretKey);

    const switched = await send("PUT", cafe.id, {
      mode: "LIVE",
      address: "Yeni Sok. 5",
      city: "İzmir",
    });
    expect(switched.statusCode).toBe(400);
    expect(switched.json().error.details).toEqual({ reason: "KEYS_REQUIRED" });
  });

  it("requires keys the first time, both keys together, and a real address", async () => {
    const { cafe } = await ctx.createCafe();
    const noKeys = await send("PUT", cafe.id, {
      mode: "SANDBOX",
      address: "Moda Cad. 1",
      city: "İstanbul",
    });
    expect(noKeys.json().error.details).toEqual({ reason: "KEYS_REQUIRED" });
    for (const body of [
      { ...settings, secretKey: undefined },
      { ...settings, address: "x" },
      { ...settings, mode: "TEST" },
    ]) {
      expect((await send("PUT", cafe.id, body)).statusCode).toBe(400);
    }
  });

  it("removes the keys but keeps the address", async () => {
    const { cafe } = await ctx.createCafe();
    await send("PUT", cafe.id, settings);
    expect((await send("DELETE", cafe.id)).statusCode).toBe(204);
    expect((await send("GET", cafe.id)).json()).toEqual({
      mode: null,
      apiKeyEnding: null,
      address: "Moda Cad. No 1, Kadıköy",
      city: "İstanbul",
    });
    const row = await ctx.prisma.cafe.findUnique({ where: { id: cafe.id } });
    expect(row?.iyzicoSecretKey).toBeNull();
  });

  it("is only for the super-admin, not the café's own staff", async () => {
    const { cafe, loginEmail } = await ctx.createCafe();
    const staff = await ctx.login(loginEmail);
    for (const [method, body] of [["GET"], ["PUT", settings], ["DELETE"]] as const) {
      expect((await send(method, cafe.id, body, staff)).statusCode).toBe(403);
    }
    expect((await send("GET", "cl0000000000000000000000")).statusCode).toBe(404);
  });

  it("can't save keys without the server's encryption key", async () => {
    const bare = createTestContext({ PAYMENT_SECRET_KEY: undefined }, { iyzicoFetch });
    try {
      const { cafe } = await bare.createCafe();
      const cookie = await bare.login((await bare.createSuperAdmin()).email);
      const res = await bare.app.inject({
        method: "PUT",
        url: `/api/admin/cafes/${cafe.id}/payment`,
        headers: { cookie },
        payload: settings,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    } finally {
      await bare.cleanup();
    }
  });
});
