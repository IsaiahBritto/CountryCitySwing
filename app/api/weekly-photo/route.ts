const { default: heicConvert }: any = await import("heic-convert")
import sharp from "sharp";
import { NextResponse } from "next/server";

export async function GET() {
  const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  const FOLDER_ID = process.env.GOOGLE_DRIVE_WEEKLY_PHOTO_FOLDER_ID;

  if (!API_KEY || !FOLDER_ID) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&key=${API_KEY}&fields=files(id,name,mimeType,createdTime)&orderBy=createdTime+desc&pageSize=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.files?.length) return NextResponse.json({ file: null });

    const file = data.files[0];

    // normal image types (JPG, PNG, etc.)
    if (!/heic|heif/i.test(file.mimeType)) {
    const imgRes = await fetch(
        `https://drive.google.com/uc?export=download&id=${file.id}`
    );

    if (!imgRes.ok) {
        return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
    }

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.mimeType};base64,${base64}`;

    return NextResponse.json({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        link: dataUrl,          // 👈 browser-safe base64
        createdTime: file.createdTime,
    });
    }

    // --- download HEIC bytes ---
    const heicRes = await fetch(
      `https://drive.google.com/uc?export=download&id=${file.id}`
    );
    const heicBuffer = Buffer.from(await heicRes.arrayBuffer());

    // --- convert HEIC → JPEG using heic-convert ---
    const outputBuffer = await heicConvert({
      buffer: heicBuffer,
      format: "JPEG",
      quality: 0.9,
    });

    // optional: sharp can resize or optimize here
    const jpegBuffer = await sharp(outputBuffer)
      .jpeg({ quality: 90 })
      .toBuffer();

    const base64 = jpegBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    return NextResponse.json({
      id: file.id,
      name: file.name,
      mimeType: "image/jpeg",
      link: dataUrl,
    });
  } catch (err) {
    console.error("Weekly photo error:", err);
    return NextResponse.json(
      { error: "Failed to load weekly photo" },
      { status: 500 }
    );
  }
}
