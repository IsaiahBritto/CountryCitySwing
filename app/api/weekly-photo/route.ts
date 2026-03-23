import { NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
const FOLDER_ID = process.env.GOOGLE_DRIVE_WEEKLY_PHOTO_FOLDER_ID;

function isHeic(mimeType: string) {
  return /heic|heif/i.test(mimeType);
}

/** List mode: paginated metadata only. Query: pageSize, pageToken. */
async function listWeeklyPhotos(request: Request) {
  if (!API_KEY || !FOLDER_ID) {
    console.error("Weekly photo API: Missing env vars", { hasApiKey: !!API_KEY, hasFolderId: !!FOLDER_ID });
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") ?? "20", 10), 1), 100);
  const pageToken = searchParams.get("pageToken") ?? "";

  // Build query string manually to avoid URLSearchParams encoding issues with the 'q' parameter
  const queryParts: string[] = [
    `q='${FOLDER_ID}'+in+parents+and+trashed=false`,
    `key=${encodeURIComponent(API_KEY)}`,
    `fields=files(id,name,mimeType,createdTime),nextPageToken`,
    `orderBy=createdTime+desc`,
    `pageSize=${pageSize}`,
  ];
  if (pageToken) {
    queryParts.push(`pageToken=${encodeURIComponent(pageToken)}`);
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${queryParts.join('&')}`
    );
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Weekly photo API: Google Drive API error", { status: res.status, error: errorText });
      return NextResponse.json({ error: "Failed to fetch from Google Drive", files: [], nextPageToken: null }, { status: res.status });
    }
    
    const data = await res.json();
    
    // Check for Google Drive API errors
    if (data.error) {
      console.error("Weekly photo API: Google Drive API returned error", data.error);
      return NextResponse.json({ error: data.error.message || "Google Drive API error", files: [], nextPageToken: null }, { status: 500 });
    }

    if (!data.files?.length) {
      console.log("Weekly photo API: No files found in Google Drive folder", { folderId: FOLDER_ID, response: JSON.stringify(data).substring(0, 200) });
      return NextResponse.json({ files: [], nextPageToken: null });
    }

    console.log("Weekly photo API: Raw files from Drive", { count: data.files.length, sample: data.files[0] });

    const files = data.files
      .filter((f: { id: string; name: string; mimeType: string; createdTime: string }) => {
        const isImage = f.mimeType.startsWith("image/") || isHeic(f.mimeType);
        if (!isImage) {
          console.log("Weekly photo API: Filtered out non-image file", { name: f.name, mimeType: f.mimeType });
        }
        return isImage;
      })
      .map((f: { id: string; name: string; createdTime: string }) => ({
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
      }));

    console.log("Weekly photo API: Returning files", { count: files.length, totalFromDrive: data.files.length });
    
    if (files.length === 0 && data.files.length > 0) {
      console.warn("Weekly photo API: All files were filtered out (not images)", { 
        totalFiles: data.files.length,
        mimeTypes: data.files.map((f: any) => f.mimeType)
      });
    }
    
    return NextResponse.json({
      files,
      nextPageToken: data.nextPageToken ?? null,
    });
  } catch (err: any) {
    console.error("Weekly photo API: Exception in listWeeklyPhotos", err);
    return NextResponse.json({ error: err.message || "Failed to fetch photos", files: [], nextPageToken: null }, { status: 500 });
  }
}

/** Latest mode: single most recent photo metadata + URL (homepage). */
async function latestWeeklyPhoto() {
  if (!API_KEY || !FOLDER_ID) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&key=${API_KEY}&fields=files(id,name,mimeType,createdTime)&orderBy=createdTime+desc&pageSize=1`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.files?.length) return NextResponse.json({ file: null });

  const file = data.files[0];
  const imageUrl = `/api/weekly-photo/${file.id}`;

  return NextResponse.json({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    link: imageUrl,
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
