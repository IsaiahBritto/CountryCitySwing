import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import type { DjMusicProvider } from "@/lib/dj/musicProvider";
import { getMusicPlatformChangeStatus } from "@/lib/music/platformChangeGuard";
import {
  getEffectiveMusicProvider,
  parseMusicProvider,
  setStoredMusicPlatformProvider,
} from "@/lib/music/platformSettings";
import { supabaseServer } from "@/lib/supabaseServer";

const ROW_ID = "default";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const [{ provider, source }, changeStatus] = await Promise.all([
      getEffectiveMusicProvider(),
      getMusicPlatformChangeStatus(),
    ]);

    const { data } = await supabaseServer
      .from("music_platform_settings")
      .select("updated_at, updated_by")
      .eq("id", ROW_ID)
      .maybeSingle();

    return NextResponse.json({
      provider,
      source,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
      canChange: changeStatus.canChange,
      blockReason: changeStatus.blockReason,
    });
  } catch (error: unknown) {
    console.error("GET /api/admin/music/platform error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load platform settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { provider, source } = await getEffectiveMusicProvider();
    if (source === "env") {
      return NextResponse.json(
        {
          error:
            "Music provider is locked by MUSIC_PROVIDER environment variable.",
        },
        { status: 403 }
      );
    }

    const changeStatus = await getMusicPlatformChangeStatus();
    if (!changeStatus.canChange) {
      return NextResponse.json(
        { error: changeStatus.blockReason },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { provider?: string };
    const next = parseMusicProvider(body.provider ?? null);
    if (!next) {
      return NextResponse.json(
        { error: "provider must be spotify or apple_music" },
        { status: 400 }
      );
    }

    if (next === provider) {
      return NextResponse.json({ provider: next, source: "database" });
    }

    await setStoredMusicPlatformProvider({
      provider: next as DjMusicProvider,
      updatedBy: auth.userId,
    });

    return NextResponse.json({ provider: next, source: "database" });
  } catch (error: unknown) {
    console.error("PATCH /api/admin/music/platform error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update platform";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
