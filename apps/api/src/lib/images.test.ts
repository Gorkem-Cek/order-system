import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "./images";

const image = (width: number, height: number, format: "jpeg" | "png") =>
  sharp({ create: { width, height, channels: 3, background: "#c08040" } })
    [format]()
    .toBuffer();

describe("processImage", () => {
  it("shrinks large images to fit 1200×1200 and stores WebP", async () => {
    const result = await processImage(await image(3000, 2000, "jpeg"));
    expect(result).toMatchObject({ contentType: "image/webp", width: 1200, height: 800 });
    expect((await sharp(result.data).metadata()).format).toBe("webp");
  });

  it("keeps small images at their size", async () => {
    const result = await processImage(await image(400, 300, "png"));
    expect([result.width, result.height]).toEqual([400, 300]);
  });

  it("drops metadata such as GPS location", async () => {
    const withExif = await sharp(await image(200, 200, "jpeg"))
      .withExif({ IFD0: { Artist: "Gizli Kişi" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const result = await processImage(withExif);
    expect((await sharp(result.data).metadata()).exif).toBeUndefined();
  });

  it.each([
    ["text", Buffer.from("not an image")],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ["a truncated JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])],
  ])("rejects %s", async (_, data) => {
    await expect(processImage(data)).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
  });
});
