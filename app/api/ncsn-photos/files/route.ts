import { NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;

function isHeic(mimeType: string) {
  return /heic|heif/i.test(mimeType);
}

/** List image files inside a folder. Query: folderId (required). */
export async function GET(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Missing env vars", files: [] },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json(
      { error: "folderId required", files: [] },
      { status: 400 }
    );
  }

  const queryParts: string[] = [
    `q='${folderId}'+in+parents+and+trashed=false`,
    `key=${encodeURIComponent(API_KEY)}`,
    `fields=files(id,name,mimeType,createdTime)`,
    `orderBy=createdTime+desc`,
    `pageSize=200`,
    `supportsAllDrives=true`,
    `includeItemsFromAllDrives=true`,
  ];

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${queryParts.join("&")}`
    );
    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message || "Failed to fetch files", files: [] },
        { status: res.ok ? 500 : res.status }
      );
    }

    const files = (data.files || [])
      .filter(
        (f: { mimeType: string }) =>
          f.mimeType.startsWith("image/") || isHeic(f.mimeType)
      )
      .map((f: { id: string; name: string; createdTime: string }) => ({
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
      }));

    return NextResponse.json({ files });
  } catch (err: any) {
    console.error("NCSN files API error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch files", files: [] },
      { status: 500 }
    );
  }
}
