import { MAX_IMAGE_BYTES, menuProductSchema, menuResponseSchema } from "@siparis/shared";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase, jpeg, multipart } from "../../test/helpers";

describe.skipIf(!hasDatabase)("product images", () => {
  const ctx = createTestContext();
  afterAll(() => ctx.cleanup());

  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    const upload = async (productId: string, data: Buffer, filename?: string, type?: string) => {
      const { payload, headers } = multipart(data, filename, type);
      return ctx.app.inject({
        method: "POST",
        url: `/api/staff/products/${productId}/image`,
        headers: { ...headers, cookie },
        payload,
      });
    };
    return { ...menu, cookie, upload };
  }

  const fetchFile = (url: string) => ctx.app.inject({ method: "GET", url });

  it("stores a resized WebP and shows it on the guest menu", async () => {
    const { upload, cay, table } = await setup();
    const res = await upload(cay.id, await jpeg());
    expect(res.statusCode).toBe(200);
    const { imageUrl } = menuProductSchema.parse(res.json());
    expect(imageUrl).toMatch(
      new RegExp(`^/uploads/cafes/[a-z0-9]+/products/${cay.id}-[\\w-]+\\.webp$`),
    );

    const file = await fetchFile(imageUrl ?? "");
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/webp");
    expect(file.headers["cache-control"]).toContain("immutable");
    const meta = await sharp(file.rawPayload).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1200, 800]);

    const guest = menuResponseSchema.parse(
      (await ctx.app.inject({ method: "GET", url: `/api/menu/${table.qrToken}` })).json(),
    );
    expect(guest.categories[0]?.products.find((p) => p.id === cay.id)?.imageUrl).toBe(imageUrl);
  });

  it("replaces a photo and deletes the old file", async () => {
    const { upload, cay } = await setup();
    const first = menuProductSchema.parse(
      (await upload(cay.id, await jpeg(800, 800))).json(),
    ).imageUrl;
    const second = menuProductSchema.parse(
      (await upload(cay.id, await jpeg(600, 400))).json(),
    ).imageUrl;

    expect(second).not.toBe(first);
    expect((await fetchFile(first ?? "")).statusCode).toBe(404);
    expect((await fetchFile(second ?? "")).statusCode).toBe(200);
  });

  it("removes a photo", async () => {
    const { upload, cay, cookie } = await setup();
    const url = menuProductSchema.parse(
      (await upload(cay.id, await jpeg(400, 400))).json(),
    ).imageUrl;
    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/api/staff/products/${cay.id}/image`,
      headers: { cookie },
    });
    expect(res.json()).toMatchObject({ imageUrl: null });
    expect((await fetchFile(url ?? "")).statusCode).toBe(404);
  });

  it("checks the content, not the file name", async () => {
    const { upload, cay } = await setup();
    const res = await upload(
      cay.id,
      Buffer.from("<script>alert(1)</script>"),
      "evil.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "UNSUPPORTED_IMAGE" } });
  });

  it("refuses files over 5 MB", async () => {
    const { upload, cay } = await setup();
    const res = await upload(cay.id, Buffer.alloc(MAX_IMAGE_BYTES + 1, 1));
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: "FILE_TOO_LARGE" } });
  });

  it("rejects a request without a file", async () => {
    const { cay, cookie } = await setup();
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/staff/products/${cay.id}/image`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it("keeps cafés apart", async () => {
    const { upload } = await setup();
    const other = await ctx.createCafeWithMenu();
    expect((await upload(other.cay.id, await jpeg(100, 100))).statusCode).toBe(404);
  });

  it("serves only real stored files", async () => {
    for (const url of [
      "/uploads/../package.json",
      "/uploads/cafes/x/products/nope.webp",
      "/uploads/x.png",
    ]) {
      expect((await fetchFile(url)).statusCode, url).toBe(404);
    }
  });
});
