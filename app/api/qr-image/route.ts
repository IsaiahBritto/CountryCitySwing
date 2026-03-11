import { NextRequest, NextResponse } from "next/server";
import { qrCodeDataUrl } from "@/lib/qrCodeImage";

/**
 * GET /api/qr-image?t=<payload>
 * Returns a PNG image of a QR code for the given payload (e.g. ccs:s:signupId).
 * Used in confirmation emails so clients that block data-URL images still show the QR.
 */
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t");
  if (!t || typeof t !== "string" || t.length > 500) {
    return NextResponse.json({ error: "Missing or invalid payload" }, { status: 400 });
  }

  try {
    const dataUrl = await qrCodeDataUrl(t);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400", // 1 day
      },
    });
  } catch (e) {
    console.error("QR image generation failed:", e);
    return NextResponse.json({ error: "Failed to generate QR image" }, { status: 500 });
  }
}
