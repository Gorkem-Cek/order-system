import sharp from "sharp";
import { AppError } from "./errors";

/** Longest side of a stored image, in pixels. */
export const MAX_IMAGE_SIZE = 1200;

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);
// Refuse huge "decompression bomb" images before decoding them fully.
const MAX_INPUT_PIXELS = 40_000_000;

export type ProcessedImage = {
  data: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
};

const unsupported = () =>
  new AppError(400, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG, WebP or AVIF image");

/**
 * Normalises an uploaded image: checks it really is an image (by content, not by name),
 * applies the camera's rotation, shrinks it to fit 1200×1200 and stores it as WebP.
 * Re-encoding also drops metadata such as GPS location.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata());
  } catch {
    throw unsupported();
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw unsupported();

  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, contentType: "image/webp", width: info.width, height: info.height };
  } catch {
    throw unsupported();
  }
}
