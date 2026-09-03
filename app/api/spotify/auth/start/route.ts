import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSpotifyOAuthRedirect,
  spotifyOAuthStateCookieOptions,
  SPOTIFY_OAUTH_STATE_COOKIE,
} from "@/lib/spotify/auth";
import { supabaseServer } from "@/lib/supabaseServer";

function appOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    req.nextUrl.origin
  );
}

async function verifyAdminToken(accessToken: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  if (error || !user) return false;

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (profile?.role ?? "").toLowerCase() === "admin";
}

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const returnTo = req.nextUrl.searchParams.get("returnTo")?.trim() || "/spotify";
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.redirect(
      `${origin}${returnTo}?error=${encodeURIComponent("missing_auth_token")}`
    );
  }

  try {
    const isAdmin = await verifyAdminToken(token);
    if (!isAdmin) {
      return NextResponse.redirect(
        `${origin}${returnTo}?error=${encodeURIComponent("forbidden")}`
      );
    }

    const { state, authorizeUrl } = createSpotifyOAuthRedirect();
    const response = NextResponse.redirect(authorizeUrl);
    const cookie = spotifyOAuthStateCookieOptions(state);
    response.cookies.set(SPOTIFY_OAUTH_STATE_COOKIE, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      path: cookie.path,
      maxAge: cookie.maxAge,
    });
    return response;
  } catch (error: unknown) {
    console.error("Spotify auth start error:", error);
    const message =
      error instanceof Error ? error.message : "spotify_auth_start_failed";
    return NextResponse.redirect(
      `${origin}${returnTo}?error=${encodeURIComponent(message)}`
    );
  }
}
