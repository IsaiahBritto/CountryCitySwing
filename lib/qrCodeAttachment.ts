import { qrCodeDataUrl } from "@/lib/qrCodeImage";

export const DEFAULT_QR_CONTENT_ID = "qr-code";

export async function makeQrCodeInlineAttachment(
  payload: string,
  opts?: {
    contentId?: string;
    sizePx?: number;
    filename?: string;
  }
): Promise<{
  contentId: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    contentId: string;
    content: Buffer;
  }>;
}> {
  const contentId = opts?.contentId ?? DEFAULT_QR_CONTENT_ID;
  const sizePx = opts?.sizePx ?? 180;
  const filename = opts?.filename ?? "checkin-qr.png";

  const dataUrl = await qrCodeDataUrl(payload, sizePx);
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  return {
    contentId,
    attachments: [
      {
        filename,
        contentType: "image/png",
        contentId,
        content: buffer,
      },
    ],
  };
}

