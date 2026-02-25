/**
 * Server-side only: generate QR code as data URL for embedding in emails.
 */
import QRCode from "qrcode";

const DEFAULT_SIZE = 180;

export async function qrCodeDataUrl(payload: string, sizePx: number = DEFAULT_SIZE): Promise<string> {
  return QRCode.toDataURL(payload, {
    type: "image/png",
    width: sizePx,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
