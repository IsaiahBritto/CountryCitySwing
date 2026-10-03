import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  applyVerifyMusicSave,
  isVerifyDance,
  type VerifyMusicSaveItem,
} from "@/lib/spotify/verifyMusic";
import { spotifyBffErrorResponse } from "@/lib/spotify/spotifyBffResponse";

function parseSaveItems(raw: unknown): VerifyMusicSaveItem[] | null {
  if (!raw || typeof raw !== "object") return null;
  const itemsRaw = (raw as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) return null;

  const items: VerifyMusicSaveItem[] = [];
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") return null;
    const trackId =
      typeof (row as VerifyMusicSaveItem).trackId === "string"
        ? (row as VerifyMusicSaveItem).trackId.trim()
        : "";
    const uri =
      typeof (row as VerifyMusicSaveItem).uri === "string"
        ? (row as VerifyMusicSaveItem).uri.trim()
        : "";
    const dance = (row as VerifyMusicSaveItem).dance;
    if (!trackId || !uri || !isVerifyDance(dance)) return null;
    items.push({ trackId, uri, dance });
  }
  return items;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const items = parseSaveItems(body);
    if (!items) {
      return NextResponse.json(
        { error: "Invalid payload: items[] with trackId, uri, dance required" },
        { status: 400 }
      );
    }

    const result = await applyVerifyMusicSave(items);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Verify music save error:", error);
    return spotifyBffErrorResponse(error, "Failed to save verify music");
  }
}
