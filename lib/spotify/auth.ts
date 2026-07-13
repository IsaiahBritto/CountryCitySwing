import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
const OAUTH_SCOPES = [
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-private",
].join(" ");

const STATE_COOKIE = "spotify_oauth_state";

export type SpotifyTokenSet = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

function requireSpotifyEnv() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, or SPOTIFY_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function buildSpotifyAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = requireSpotifyEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
    show_dialog: "true",
  });
  return `${SPOTIFY_ACCOUNTS}/authorize?${params.toString()}`;
}

export async function beginSpotifyOAuth(): Promise<{ url: string }> {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return { url: buildSpotifyAuthorizeUrl(state) };
}

export async function verifyOAuthState(state: string | null): Promise<boolean> {
  if (!state) return false;
  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  return Boolean(expected && expected === state);
}

export async function exchangeAuthorizationCode(
  code: string
): Promise<SpotifyTokenSet> {
  const { clientId, clientSecret, redirectUri } = requireSpotifyEnv();
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as SpotifyTokenSet;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<SpotifyTokenSet> {
  const { clientId, clientSecret } = requireSpotifyEnv();
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as SpotifyTokenSet;
}

export async function saveSpotifyCredentials(input: {
  refreshToken: string;
  spotifyUserId: string;
}): Promise<void> {
  const { error } = await supabaseServer.from("spotify_oauth_credentials").upsert(
    {
      id: "default",
      refresh_token: input.refreshToken,
      spotify_user_id: input.spotifyUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    throw new Error(`Failed to save Spotify credentials: ${error.message}`);
  }
}

export async function getStoredSpotifyCredentials(): Promise<{
  refreshToken: string;
  spotifyUserId: string;
} | null> {
  const { data, error } = await supabaseServer
    .from("spotify_oauth_credentials")
    .select("refresh_token, spotify_user_id")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Spotify credentials: ${error.message}`);
  }
  if (!data?.refresh_token || !data?.spotify_user_id) return null;
  return {
    refreshToken: data.refresh_token,
    spotifyUserId: data.spotify_user_id,
  };
}

export async function getValidAccessToken(): Promise<{
  accessToken: string;
  spotifyUserId: string;
}> {
  const creds = await getStoredSpotifyCredentials();
  if (!creds) {
    throw new Error("Spotify is not connected. Connect Spotify on /spotify first.");
  }
  const tokens = await refreshAccessToken(creds.refreshToken);
  if (tokens.refresh_token && tokens.refresh_token !== creds.refreshToken) {
    await saveSpotifyCredentials({
      refreshToken: tokens.refresh_token,
      spotifyUserId: creds.spotifyUserId,
    });
  }
  return {
    accessToken: tokens.access_token,
    spotifyUserId: creds.spotifyUserId,
  };
}
