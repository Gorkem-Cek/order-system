import QRCode from "qrcode";

/**
 * A QR code as an SVG document. Medium error correction still scans when a printed code is
 * a little scratched or dirty; the 2-module margin is the quiet zone scanners need.
 */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
}
