import {
  ensureTrackOnMaster,
  getActivePlaylistStatus,
  loadSnapshotTracks,
  type SocialPlaylistTrackRow,
} from "@/lib/spotify/activePlaylist";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  getCurrentlyPlaying,
  replacePlaylistItemAtPosition,
  type SpotifySearchTrack,
} from "@/lib/spotify/client";
import {
  applyUserProvisional,
} from "@/lib/spotify/lineDanceMeta";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  findRequestInsertTarget,
  parsePlaylistIdFromContextUri,
  resolvePlaybackIndex,
  type SnapshotTrack,
} from "@/lib/spotify/requestInsert";
import {
  assertCanRequest,
  getRequestCounts,
} from "@/lib/spotify/requestQuota";
import { supabaseServer } from "@/lib/supabaseServer";
import { isLineDanceLevel } from "@/lib/spotify/lineDanceLevels";

const ACTIVE_ID = "default";

/** Serialize request handling in this process to avoid double-replacing one slot. */
let requestChain: Promise<unknown> = Promise.resolve();

function withRequestLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(fn, fn);
  requestChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export type SocialRequestInput = {
  trackId: string;
  uri: string;
  name: string;
  primaryArtist: string;
  genre: GenrePool;
  lineDanceName?: string | null;
  lineDanceLevel?: string | null;
  requesterUserId?: string | null;
  requesterToken?: string | null;
};

export type SocialRequestResult = {
  ok: true;
  result: "replaced" | "appended";
  position: number;
  addedToMaster: boolean;
  genre: GenrePool;
  trackName: string;
};

import { SocialRequestError } from "@/lib/spotify/socialRequestError";

export { SocialRequestError };

function toSnapshot(rows: SocialPlaylistTrackRow[]): SnapshotTrack[] {
  return rows.map((r) => ({
    position: r.position,
    spotifyTrackId: r.spotify_track_id,
    uri: r.uri,
    name: r.name,
    primaryArtist: r.primary_artist,
    genre: r.genre,
    source: r.source,
  }));
}

async function logRequest(input: {
  track: SocialRequestInput;
  addedToMaster: boolean;
  result: "replaced" | "appended" | "rejected";
  position: number | null;
  spotifyPlaylistId: string | null;
  errorMessage?: string;
}): Promise<void> {
  await supabaseServer.from("social_song_requests").insert({
    spotify_track_id: input.track.trackId,
    uri: input.track.uri,
    name: input.track.name,
    primary_artist: input.track.primaryArtist,
    genre: input.track.genre,
    added_to_master: input.addedToMaster,
    result: input.result,
    position: input.position,
    spotify_playlist_id: input.spotifyPlaylistId,
    error_message: input.errorMessage ?? null,
    requester_user_id: input.track.requesterUserId ?? null,
    requester_token: input.track.requesterToken ?? null,
  });
}

export async function submitSocialSongRequest(
  input: SocialRequestInput
): Promise<SocialRequestResult> {
  return withRequestLock(() => submitSocialSongRequestUnlocked(input));
}

async function submitSocialSongRequestUnlocked(
  input: SocialRequestInput
): Promise<SocialRequestResult> {
  const status = await getActivePlaylistStatus();
  if (!status.isActive || !status.spotifyPlaylistId || !status.activatedAt) {
    throw new SocialRequestError(
      "Song requests aren’t open right now.",
      403
    );
  }

  const genre = input.genre;
  if (genre !== "cs" && genre !== "wcs" && genre !== "ld" && genre !== "ts") {
    throw new SocialRequestError("Invalid genre.");
  }

  if (!status.availableGenres.includes(genre)) {
    throw new SocialRequestError(
      "That dance style isn’t part of tonight’s playlist.",
      403
    );
  }

  const requesterUserId = input.requesterUserId ?? null;
  const requesterToken = input.requesterToken ?? null;
  if (!requesterUserId && !requesterToken) {
    throw new SocialRequestError(
      "Could not verify your session. Refresh the page and try again.",
      403
    );
  }

  const counts = await getRequestCounts({
    spotifyPlaylistId: status.spotifyPlaylistId,
    activatedAt: status.activatedAt,
    requesterUserId,
    requesterToken,
    genres: [genre],
  });
  assertCanRequest({
    genre,
    limits: status.requestLimits,
    counts,
  });

  const { accessToken } = await getValidAccessToken();
  const rows = await loadSnapshotTracks();
  const snapshot = toSnapshot(rows);

  if (snapshot.some((t) => t.spotifyTrackId === input.trackId)) {
    await logRequest({
      track: input,
      addedToMaster: false,
      result: "rejected",
      position: null,
      spotifyPlaylistId: status.spotifyPlaylistId,
      errorMessage: "Track already in active playlist",
    });
    throw new SocialRequestError(
      "That song is already in tonight’s Social playlist."
    );
  }

  const { addedToMaster } = await ensureTrackOnMaster({
    accessToken,
    track: { id: input.trackId, uri: input.uri },
    genre,
  });

  if (genre === "ld") {
    try {
      const level =
        typeof input.lineDanceLevel === "string" &&
        isLineDanceLevel(input.lineDanceLevel.trim())
          ? input.lineDanceLevel.trim()
          : null;
      await applyUserProvisional({
        trackId: input.trackId,
        trackName: input.name,
        primaryArtist: input.primaryArtist,
        lineDanceName: input.lineDanceName,
        level,
      });
    } catch (err) {
      console.warn("Line dance metadata save failed:", err);
    }
  }

  let playing = null;
  try {
    playing = await getCurrentlyPlaying(accessToken);
  } catch (err) {
    console.warn("Could not read Spotify playback state:", err);
  }

  const contextPlaylistId = parsePlaylistIdFromContextUri(
    playing?.contextUri
  );
  const currentIndex = resolvePlaybackIndex(
    snapshot,
    playing,
    contextPlaylistId,
    status.spotifyPlaylistId
  );

  const target = findRequestInsertTarget(
    snapshot,
    currentIndex,
    genre,
    status.pattern
  );
  const now = new Date().toISOString();

  if (target.kind === "replace") {
    const existing = snapshot[target.position];
    if (!existing) {
      throw new SocialRequestError("Playlist snapshot is out of sync.", 500);
    }

    await replacePlaylistItemAtPosition(
      accessToken,
      status.spotifyPlaylistId,
      target.position,
      existing.uri,
      input.uri
    );

    const { error } = await supabaseServer
      .from("social_playlist_tracks")
      .update({
        spotify_track_id: input.trackId,
        uri: input.uri,
        name: input.name,
        primary_artist: input.primaryArtist,
        genre,
        source: "request",
        updated_at: now,
      })
      .eq("active_playlist_id", ACTIVE_ID)
      .eq("position", target.position);

    if (error) {
      throw new SocialRequestError(
        `Failed to update snapshot: ${error.message}`,
        500
      );
    }

    await logRequest({
      track: input,
      addedToMaster,
      result: "replaced",
      position: target.position,
      spotifyPlaylistId: status.spotifyPlaylistId,
    });

    return {
      ok: true,
      result: "replaced",
      position: target.position,
      addedToMaster,
      genre,
      trackName: input.name,
    };
  }

  // Append
  await addTracksToPlaylist(accessToken, status.spotifyPlaylistId, [
    input.uri,
  ]);
  const position = snapshot.length;

  const { error } = await supabaseServer.from("social_playlist_tracks").insert({
    active_playlist_id: ACTIVE_ID,
    position,
    spotify_track_id: input.trackId,
    uri: input.uri,
    name: input.name,
    primary_artist: input.primaryArtist,
    genre,
    source: "request",
    updated_at: now,
  });

  if (error) {
    throw new SocialRequestError(
      `Failed to append snapshot: ${error.message}`,
      500
    );
  }

  await logRequest({
    track: input,
    addedToMaster,
    result: "appended",
    position,
    spotifyPlaylistId: status.spotifyPlaylistId,
  });

  return {
    ok: true,
    result: "appended",
    position,
    addedToMaster,
    genre,
    trackName: input.name,
  };
}

export function searchTrackToRequestFields(
  track: SpotifySearchTrack
): Pick<
  SocialRequestInput,
  "trackId" | "uri" | "name" | "primaryArtist"
> {
  return {
    trackId: track.id,
    uri: track.uri,
    name: track.name,
    primaryArtist: track.primaryArtist,
  };
}
