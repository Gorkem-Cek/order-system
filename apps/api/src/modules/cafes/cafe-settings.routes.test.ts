import { CAFE_ID_HEADER, menuResponseSchema, staffCafeSchema } from "@siparis/shared";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { createTestContext, hasDatabase, jpeg, multipart } from "../../test/helpers";

describe.skipIf(!hasDatabase)("café settings (staff)", () => {
  const ctx = createTestContext();
  afterAll(() => ctx.cleanup());

  async function setup() {
    const menu = await ctx.createCafeWithMenu();
    const cookie = await ctx.login(menu.loginEmail);
    const patch = (payload: object) =>
      ctx.app.inject({ method: "PATCH", url: "/api/staff/cafe", headers: { cookie }, payload });
    const upload = async (kind: string, data: Buffer) => {
      const { payload, headers } = multipart(data);
      return ctx.app.inject({
        method: "POST",
        url: `/api/staff/cafe/images/${kind}`,
        headers: { ...headers, cookie },
        payload,
      });
    };
    const remove = (kind: string) =>
      ctx.app.inject({
        method: "DELETE",
        url: `/api/staff/cafe/images/${kind}`,
        headers: { cookie },
      });
    const guestMenu = async () =>
      menuResponseSchema.parse(
        (await ctx.app.inject({ method: "GET", url: `/api/menu/${menu.table.qrToken}` })).json(),
      );
    return { ...menu, cookie, patch, upload, remove, guestMenu };
  }

  it("changes the name and colour; guests see them", async () => {
    const { patch, guestMenu } = await setup();
    const res = await patch({ name: "  Köşe Kahve ", primaryColor: "#1D4ED8" });
    expect(res.statusCode).toBe(200);
    expect(staffCafeSchema.parse(res.json())).toMatchObject({
      name: "Köşe Kahve",
      primaryColor: "#1d4ed8",
    });
    expect((await guestMenu()).cafe).toMatchObject({
      name: "Köşe Kahve",
      primaryColor: "#1d4ed8",
    });
  });

  it("changes one field at a time and rejects invalid values", async () => {
    const { patch } = await setup();
    expect((await patch({ primaryColor: "#00aa55" })).json()).toMatchObject({
      name: "Test Kafe",
      primaryColor: "#00aa55",
    });
    for (const body of [
      {},
      { name: "x" },
      { primaryColor: "red" },
      { primaryColor: "#12345" },
      { primaryColor: "url(javascript:1)" },
    ]) {
      expect((await patch(body)).statusCode).toBe(400);
    }
  });

  it("can't change what only the super-admin may change", async () => {
    const { patch, cafe } = await setup();
    await patch({ name: "Yeni Ad", isActive: false, slug: "baska" });
    expect(await ctx.prisma.cafe.findUnique({ where: { id: cafe.id } })).toMatchObject({
      name: "Yeni Ad",
      isActive: true,
      slug: cafe.slug,
    });
  });

  it("stores a small logo and a wide cover, shown on the guest menu", async () => {
    const { upload, guestMenu } = await setup();
    const logo = staffCafeSchema.parse((await upload("logo", await jpeg(2000, 2000))).json());
    const cover = staffCafeSchema.parse((await upload("cover", await jpeg(3200, 1200))).json());
    expect(cover.logoUrl).toBe(logo.logoUrl);

    const size = async (url: string | null) => {
      const file = await ctx.app.inject({ method: "GET", url: url ?? "" });
      const { width, height, format } = await sharp(file.rawPayload).metadata();
      return { width, height, format };
    };
    expect(await size(logo.logoUrl)).toEqual({ width: 512, height: 512, format: "webp" });
    expect(await size(cover.coverUrl)).toEqual({ width: 1600, height: 600, format: "webp" });
    expect((await guestMenu()).cafe).toMatchObject({
      logoUrl: logo.logoUrl,
      coverUrl: cover.coverUrl,
    });
  });

  it("replacing or removing an image deletes the old file", async () => {
    const { upload, remove } = await setup();
    const first = staffCafeSchema.parse((await upload("logo", await jpeg(300, 300))).json());
    const second = staffCafeSchema.parse((await upload("logo", await jpeg(200, 200))).json());
    expect(second.logoUrl).not.toBe(first.logoUrl);
    const status = async (url: string | null) =>
      (await ctx.app.inject({ method: "GET", url: url ?? "" })).statusCode;
    expect(await status(first.logoUrl)).toBe(404);

    const removed = await remove("logo");
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ logoUrl: null });
    expect(await status(second.logoUrl)).toBe(404);
  });

  it("rejects unknown image kinds and files that aren't images", async () => {
    const { upload } = await setup();
    expect((await upload("banner", await jpeg(100, 100))).statusCode).toBe(400);
    const res = await upload("logo", Buffer.from("not an image"));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("UNSUPPORTED_IMAGE");
  });

  it("needs a login; a super-admin edits the café chosen with the header", async () => {
    const { cafe } = await setup();
    const anonymous = await ctx.app.inject({
      method: "PATCH",
      url: "/api/staff/cafe",
      payload: { name: "Hack" },
    });
    expect(anonymous.statusCode).toBe(401);

    const admin = await ctx.createSuperAdmin();
    const cookie = await ctx.login(admin.email);
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/api/staff/cafe",
      headers: { cookie, [CAFE_ID_HEADER]: cafe.id },
      payload: { name: "Admin Değiştirdi" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: cafe.id, name: "Admin Değiştirdi" });
  });
});
