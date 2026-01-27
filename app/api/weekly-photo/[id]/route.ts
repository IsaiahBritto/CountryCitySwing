const { default: heicConvert }: any = await import("heic-convert");
import sharp from "sharp";
import { NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;

function isHeic(mimeType: string) {
  return /heic|heif/i.test(mimeType);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (!API_KEY) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?key=${API_KEY}&fields=id,name,mimeType`
    );
    const meta = await metaRes.json();
    if (meta.error || !meta.mimeType) {
      return NextResponse.json(
        { error: meta.error?.message ?? "File not found" },
        { status: 404 }
      );
    }

    const mimeType = meta.mimeType as string;
    const downloadRes = await fetch(
      `https://drive.google.com/uc?export=download&id=${id}`
    );
    if (!downloadRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image from Drive" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await downloadRes.arrayBuffer());

    if (isHeic(mimeType)) {
      const outputBuffer = await heicConvert({
        buffer,
        format: "JPEG",
        quality: 0.9,
      });
      const jpegBuffer = await sharp(outputBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();

      return new NextResponse(new Uint8Array(jpegBuffer), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("Weekly photo [id] error:", err);
    return NextResponse.json(
      { error: "Failed to load weekly photo" },
      { status: 500 }
    );
  }
}
