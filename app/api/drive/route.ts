import { NextResponse } from "next/server";

export async function GET() {
  const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!API_KEY || !FOLDER_ID) {
    return NextResponse.json({ error: "Missing Drive credentials" }, { status: 500 });
  }

  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&key=${API_KEY}&fields=files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink)`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.files) {
      return NextResponse.json({ files: [] });
    }

    // Only allow image/video types
    const files = data.files
      .filter(
        (f: any) =>
          f.mimeType.includes("image/") || f.mimeType.includes("video/")
      )
      .map((f: any) => ({
      id: f.id,
      name: f.name,
      type: f.mimeType.includes("video/") ? "video" : "image",
      link: `/api/media/${f.id}`, // 👈 direct link fix
      thumb: f.thumbnailLink,
    }));

    return NextResponse.json({ files });
  } catch (err) {
    console.error("Drive fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
  }
}
