import { NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
const NCSN_FOLDER_ID = process.env.GOOGLE_DRIVE_NCSN_PHOTOS_FOLDER_ID;

const FOLDER_MIME = "application/vnd.google-apps.folder";
const PAGE_SIZE = 6;

/** List date folders inside NCSN Photos. Query: pageToken (optional). Returns 6 folders per page. */
export async function GET(request: Request) {
  if (!API_KEY || !NCSN_FOLDER_ID) {
    return NextResponse.json(
      { error: "Missing env vars", folders: [], nextPageToken: null },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pageToken = searchParams.get("pageToken") ?? "";

  const queryParts: string[] = [
    `q='${NCSN_FOLDER_ID}'+in+parents+and+trashed=false+and+mimeType='${FOLDER_MIME}'`,
    `key=${encodeURIComponent(API_KEY)}`,
    `fields=files(id,name,createdTime),nextPageToken`,
    `orderBy=createdTime+desc`,
    `pageSize=${PAGE_SIZE}`,
    `supportsAllDrives=true`,
    `includeItemsFromAllDrives=true`,
  ];
  if (pageToken) {
    queryParts.push(`pageToken=${encodeURIComponent(pageToken)}`);
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${queryParts.join("&")}`
    );
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch from Google Drive", folders: [], nextPageToken: null },
        { status: res.status }
      );
    }
    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || "Google Drive API error", folders: [], nextPageToken: null },
        { status: 500 }
      );
    }

    let folders = (data.files || []).map(
      (f: { id: string; name: string; createdTime: string }) => ({
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
      })
    );

    // Fallback: if folder-only query returned nothing (e.g. Shared Drive quirk), list all children and filter to folders
    if (folders.length === 0 && !pageToken) {
      const fallbackParts: string[] = [
        `q='${NCSN_FOLDER_ID}'+in+parents+and+trashed=false`,
        `key=${encodeURIComponent(API_KEY)}`,
        `fields=files(id,name,mimeType,createdTime),nextPageToken`,
        `orderBy=createdTime+desc`,
        `pageSize=50`,
        `supportsAllDrives=true`,
        `includeItemsFromAllDrives=true`,
      ];
      const fallbackRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?${fallbackParts.join("&")}`
      );
      const fallbackData = await fallbackRes.json();
      const allItems = fallbackData.files || [];
      const folderItems = allItems
        .filter((f: { mimeType?: string }) => f.mimeType === FOLDER_MIME)
        .slice(0, PAGE_SIZE)
        .map((f: { id: string; name: string; createdTime: string }) => ({
          id: f.id,
          name: f.name,
          createdTime: f.createdTime,
        }));
      if (folderItems.length > 0) {
        folders = folderItems;
      }
    }

    return NextResponse.json({
      folders,
      nextPageToken: data.nextPageToken ?? null,
    });
  } catch (err: any) {
    console.error("NCSN folders API error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch folders", folders: [], nextPageToken: null },
      { status: 500 }
    );
  }
}
