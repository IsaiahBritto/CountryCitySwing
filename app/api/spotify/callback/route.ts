import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  saveSpotifyCredentials,
  verifyOAuthState,
} from "@/lib/spotify/auth";
import { fetchCurrentUserId } from "@/lib/spotify/client";

function appOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    req.nextUrl.origin
  );
}

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${origin}/spotify?error=${encodeURIComponent(error)}`
      );
    }

    if (!(await verifyOAuthState(state))) {
      return NextResponse.redirect(
        `${origin}/spotify?error=${encodeURIComponent("invalid_oauth_state")}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${origin}/spotify?error=${encodeURIComponent("missing_code")}`
      );
    }

    const tokens = await exchangeAuthorizationCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${origin}/spotify?error=${encodeURIComponent("missing_refresh_token")}`
      );
    }

    const spotifyUserId = await fetchCurrentUserId(tokens.access_token);
    await saveSpotifyCredentials({
      refreshToken: tokens.refresh_token,
      spotifyUserId,
      grantedScopes: tokens.scope ?? null,
    });

    return NextResponse.redirect(`${origin}/spotify?connected=1`);
  } catch (err: unknown) {
    console.error("Spotify callback error:", err);
    const message =
      err instanceof Error ? err.message : "spotify_callback_failed";
    return NextResponse.redirect(
      `${origin}/spotify?error=${encodeURIComponent(message)}`
    );
  }
}
