const { default: heicConvert }: any = await import("heic-convert");
import sharp from "sharp";
import { NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
const FOLDER_ID = process.env.GOOGLE_DRIVE_WEEKLY_PHOTO_FOLDER_ID;

function isHeic(mimeType: string) {
  return /heic|heif/i.test(mimeType);
}

/** List mode: paginated metadata only. Query: pageSize, pageToken. */
async function listWeeklyPhotos(request: Request) {
  if (!API_KEY || !FOLDER_ID) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") ?? "20", 10), 1), 100);
  const pageToken = searchParams.get("pageToken") ?? "";

  const params = new URLSearchParams({
    q: `'${FOLDER_ID}'+in+parents+and+trashed=false`,
    key: API_KEY,
    fields: "files(id,name,mimeType,createdTime),nextPageToken",
    orderBy: "createdTime desc",
    pageSize: String(pageSize),
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`
  );
  const data = await res.json();

  if (!data.files?.length) {
    return NextResponse.json({ files: [], nextPageToken: null });
  }

  const files = data.files
    .filter((f: { mimeType: string }) =>
      f.mimeType.startsWith("image/") || isHeic(f.mimeType)
    )
    .map((f: { id: string; name: string; createdTime: string }) => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
    }));

  return NextResponse.json({
    files,
    nextPageToken: data.nextPageToken ?? null,
  });
}

/** Latest mode: single most recent photo with base64 link (homepage). */
async function latestWeeklyPhoto() {
  if (!API_KEY || !FOLDER_ID) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&key=${API_KEY}&fields=files(id,name,mimeType,createdTime)&orderBy=createdTime+desc&pageSize=1`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.files?.length) return NextResponse.json({ file: null });

  const file = data.files[0];

  if (!isHeic(file.mimeType)) {
    const imgRes = await fetch(
      `https://drive.google.com/uc?export=download&id=${file.id}`
    );
    if (!imgRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: 500 }
      );
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.mimeType};base64,${base64}`;
    return NextResponse.json({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      link: dataUrl,
      createdTime: file.createdTime,
    });
  }

  const heicRes = await fetch(
    `https://drive.google.com/uc?export=download&id=${file.id}`
  );
  const heicBuffer = Buffer.from(await heicRes.arrayBuffer());
  const outputBuffer = await heicConvert({
    buffer: heicBuffer,
    format: "JPEG",
    quality: 0.9,
  });
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
    createdTime: file.createdTime,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageSize = searchParams.get("pageSize");

  try {
    if (pageSize != null && pageSize !== "") {
      return await listWeeklyPhotos(request);
    }
    return await latestWeeklyPhoto();
  } catch (err) {
    console.error("Weekly photo error:", err);
    return NextResponse.json(
      { error: "Failed to load weekly photo" },
      { status: 500 }
    );
  }
}
