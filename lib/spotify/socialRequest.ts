import {
  ensureTrackOnMaster,
  getActivePlaylistStatus,
  loadSnapshotTracks,
  type SocialPlaylistTrackRow,
} from "@/lib/spotify/activePlaylist";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  fetchPlaylistSnapshotIdOnly,
  getCurrentlyPlaying,
  removePlaylistItemAtPosition,
  replacePlaylistItemAtPosition,
  swapPlaylistItemsAtPositions,
  type SpotifySearchTrack,
} from "@/lib/spotify/client";
import { getActiveSessionRow } from "@/lib/spotify/djSessionServer";
import {
  applyUserProvisional,
} from "@/lib/spotify/lineDanceMeta";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import type { RequestLimits } from "@/lib/spotify/requestLimits";
import type { RequestRefreshMinutes } from "@/lib/spotify/requestRefresh";
import {
  findRequestInsertTarget,
  parsePlaylistIdFromContextUri,
  resolveExistingTrackAction,
  resolveInsertPlayheadIndex,
  resolvePlaybackIndex,
  type SnapshotTrack,
} from "@/lib/spotify/requestInsert";
import {
  buildDeckPlaylistPatch,
  inputToDeckTrack,
} from "@/lib/spotify/deckPlaylistPatchBuilder";
import { buildLivePlaylistViewFromSession } from "@/lib/spotify/requestLiveView";
import type { DeckPlaylistPatch } from "@/lib/spotify/deckPlaylistSync";
import type { LivePlaylistView } from "@/lib/spotify/requestLiveView";
import type { DjSessionRow } from "@/lib/spotify/djSession";
import {
  assertCanRequest,
  buildQuotaSnapshot,
} from "@/lib/spotify/requestQuota";
import { supabaseServer } from "@/lib/supabaseServer";
import { isLineDanceLevel } from "@/lib/spotify/lineDanceLevels";
import { readActivePlaylistSnapshotId } from "@/lib/spotify/spotifyServerCache";

const ACTIVE_ID = "default";

const SOCIAL_PLAYLIST_MUTATE_OPTS = { useActivePlaylistCache: true as const };

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
  durationMs?: number;
  genre: GenrePool;
  lineDanceName?: string | null;
  lineDanceLevel?: string | null;
  requesterUserId?: string | null;
  requesterToken?: string | null;
};

export type SocialRequestResult = {
  ok: true;
  result: "replaced" | "appended" | "swapped";
  position: number;
  swapFrom?: number;
  track?: {
    id: string;
    uri: string;
    name: string;
    primaryArtist: string;
    durationMs: number;
  };
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

async function assertRequesterQuota(input: {
  activationId: string;
  refreshMinutes: RequestRefreshMinutes;
  requestLimits: RequestLimits | null;
  genre: GenrePool;
  requesterUserId: string | null;
  requesterToken: string | null;
}): Promise<void> {
  const quota = await buildQuotaSnapshot({
    activationId: input.activationId,
    refreshMinutes: input.refreshMinutes,
    requestLimits: input.requestLimits,
    availableGenres: [input.genre],
    requesterUserId: input.requesterUserId,
    requesterToken: input.requesterToken,
  });
  assertCanRequest({
    genre: input.genre,
    limits: input.requestLimits,
    counts: quota.used,
    nextAvailableAt: quota.nextAvailableAt,
  });
}

async function applyLineDanceIfNeeded(
  input: SocialRequestInput,
  genre: GenrePool
): Promise<void> {
  if (genre !== "ld") return;
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

async function purgeStaleSnapshotTrack(input: {
  accessToken: string;
  spotifyPlaylistId: string;
  trackId: string;
  snapshot: SnapshotTrack[];
  cachedSnapshotId: string | null;
}): Promise<void> {
  const staleRows = input.snapshot.filter(
    (t) => t.spotifyTrackId === input.trackId
  );
  if (staleRows.length === 0) return;

  const byPositionDesc = [...staleRows].sort(
    (a, b) => b.position - a.position
  );
  for (const row of byPositionDesc) {
    try {
      await removePlaylistItemAtPosition(
        input.accessToken,
        input.spotifyPlaylistId,
        row.uri,
        row.position,
        {
          ...SOCIAL_PLAYLIST_MUTATE_OPTS,
          cachedSnapshotId: input.cachedSnapshotId,
        }
      );
    } catch (err) {
      console.warn(
        `Could not remove stale track at position ${row.position}:`,
        err
      );
    }
  }

  const positions = staleRows.map((r) => r.position);
  const { error } = await supabaseServer
    .from("social_playlist_tracks")
    .delete()
    .eq("active_playlist_id", ACTIVE_ID)
    .eq("spotify_track_id", input.trackId)
    .in("position", positions);

  if (error) {
    throw new SocialRequestError(
      `Failed to purge stale snapshot rows: ${error.message}`,
      500
    );
  }
}

async function logRequest(input: {
  track: SocialRequestInput;
  addedToMaster: boolean;
  result: "replaced" | "appended" | "swapped" | "rejected";
  position: number | null;
  spotifyPlaylistId: string | null;
  activationId: string | null;
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
    activation_id: input.activationId,
    error_message: input.errorMessage ?? null,
    requester_user_id: input.track.requesterUserId ?? null,
    requester_token: input.track.requesterToken ?? null,
  });
}

function buildSuccessResult(input: {
  request: SocialRequestInput;
  result: "replaced" | "appended" | "swapped";
  position: number;
  swapFrom?: number;
  addedToMaster: boolean;
}): SocialRequestResult {
  const trackFields = inputToDeckTrack(input.request);
  return {
    ok: true,
    result: input.result,
    position: input.position,
    ...(input.swapFrom != null ? { swapFrom: input.swapFrom } : {}),
    ...(input.result === "replaced" || input.result === "appended"
      ? { track: trackFields }
      : {}),
    addedToMaster: input.addedToMaster,
    genre: input.request.genre,
    trackName: input.request.name,
  };
}

async function notifyDeckIfSynced(input: {
  session: DjSessionRow | null;
  liveView: LivePlaylistView;
  patch: DeckPlaylistPatch | null;
}): Promise<void> {
  if (!input.patch || input.liveView.deckAuthority !== "social_deck") return;
  if (!input.session || !input.liveView.activeDeck) return;

  const { notifyDeckPlaylistPatch } = await import(
    "@/lib/spotify/djSessionBroadcastServer"
  );
  await notifyDeckPlaylistPatch({
    sessionId: input.session.id,
    deck: input.liveView.activeDeck,
    patch: input.patch,
  });
}

async function completeSuccessfulRequest(input: {
  session: DjSessionRow | null;
  liveView: LivePlaylistView;
  request: SocialRequestInput;
  result: "replaced" | "appended" | "swapped";
  position: number;
  swapFrom?: number;
  purgePositions?: number[];
  addedToMaster: boolean;
}): Promise<SocialRequestResult> {
  const success = buildSuccessResult(input);
  const patch = buildDeckPlaylistPatch({
    result: input.result,
    position: input.position,
    swapFrom: input.swapFrom,
    track:
      input.result === "replaced" || input.result === "appended"
        ? inputToDeckTrack(input.request)
        : undefined,
    purgePositions: input.purgePositions,
  });

  try {
    await notifyDeckIfSynced({
      session: input.session,
      liveView: input.liveView,
      patch,
    });
  } catch (err) {
    console.warn("Deck playlist patch notification failed:", err);
  }

  return success;
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
  if (
    !status.isActive ||
    !status.spotifyPlaylistId ||
    !status.activatedAt ||
    !status.activationId
  ) {
    throw new SocialRequestError(
      "Song requests aren’t open right now.",
      403
    );
  }

  if (!status.structure || status.pattern.length === 0) {
    throw new SocialRequestError(
      "Tonight’s playlist structure is not configured — re-activate from admin.",
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

  const quotaArgs = {
    activationId: status.activationId,
    refreshMinutes: status.requestRefreshMinutes,
    requestLimits: status.requestLimits,
    genre,
    requesterUserId,
    requesterToken,
  };

  const { accessToken } = await getValidAccessToken();
  const cachedSnapshotId = await readActivePlaylistSnapshotId();
  let rows = await loadSnapshotTracks();
  let snapshot = toSnapshot(rows);

  const session = await getActiveSessionRow();
  const liveView = buildLivePlaylistViewFromSession(
    session,
    status.spotifyPlaylistId
  );
  let purgePositions: number[] = [];

  let spotifyPlaying = null;
  const skipSpotifyPlayhead =
    liveView.deckAuthority === "social_deck" ||
    (session != null && session.status === "active");
  if (!skipSpotifyPlayhead) {
    try {
      spotifyPlaying = await getCurrentlyPlaying(accessToken);
    } catch (err) {
      console.warn("Could not read Spotify playback state:", err);
    }
  }

  const contextPlaylistId = parsePlaylistIdFromContextUri(
    spotifyPlaying?.contextUri
  );
  const spotifyPlayheadIndex = resolvePlaybackIndex(
    snapshot,
    spotifyPlaying,
    contextPlaylistId,
    status.spotifyPlaylistId
  );
  let currentIndex = resolveInsertPlayheadIndex(
    snapshot,
    liveView,
    spotifyPlayheadIndex
  );
  const fallbackNowPlayingTrackId = spotifyPlaying?.trackId ?? null;

  const existing = snapshot.find((t) => t.spotifyTrackId === input.trackId);
  if (existing) {
    const action = resolveExistingTrackAction(
      snapshot,
      input.trackId,
      currentIndex,
      genre,
      liveView,
      status.pattern,
      fallbackNowPlayingTrackId
    );

    if (action.kind === "not_in_live_playlist") {
      purgePositions = snapshot
        .filter((t) => t.spotifyTrackId === input.trackId)
        .map((t) => t.position);
      await purgeStaleSnapshotTrack({
        accessToken,
        spotifyPlaylistId: status.spotifyPlaylistId,
        trackId: input.trackId,
        snapshot,
        cachedSnapshotId,
      });
      rows = await loadSnapshotTracks();
      snapshot = toSnapshot(rows);
      const refreshedSpotifyIndex =
        liveView.deckAuthority === "social_deck"
          ? -1
          : resolvePlaybackIndex(
              snapshot,
              spotifyPlaying,
              contextPlaylistId,
              status.spotifyPlaylistId
            );
      currentIndex = resolveInsertPlayheadIndex(
        snapshot,
        liveView,
        refreshedSpotifyIndex
      );
    } else if (action.kind === "swap") {
      const fromTrack = snapshot[action.from];
      const toTrack = snapshot[action.to];
      if (!fromTrack || !toTrack) {
        throw new SocialRequestError("Playlist snapshot is out of sync.", 500);
      }

      await assertRequesterQuota(quotaArgs);
      const { addedToMaster } = await ensureTrackOnMaster({
        accessToken,
        track: { id: input.trackId, uri: input.uri },
        genre,
      });
      await applyLineDanceIfNeeded(input, genre);

      await swapPlaylistItemsAtPositions(
        accessToken,
        status.spotifyPlaylistId,
        action.from,
        fromTrack.uri,
        action.to,
        toTrack.uri,
        {
          ...SOCIAL_PLAYLIST_MUTATE_OPTS,
          cachedSnapshotId,
        }
      );

      const now = new Date().toISOString();
      const { error: toError } = await supabaseServer
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
        .eq("position", action.to);
      if (toError) {
        throw new SocialRequestError(
          `Failed to update snapshot: ${toError.message}`,
          500
        );
      }

      const { error: fromError } = await supabaseServer
        .from("social_playlist_tracks")
        .update({
          spotify_track_id: toTrack.spotifyTrackId,
          uri: toTrack.uri,
          name: toTrack.name,
          primary_artist: toTrack.primaryArtist,
          genre: toTrack.genre,
          source: toTrack.source,
          updated_at: now,
        })
        .eq("active_playlist_id", ACTIVE_ID)
        .eq("position", action.from);
      if (fromError) {
        throw new SocialRequestError(
          `Failed to update snapshot: ${fromError.message}`,
          500
        );
      }

      await logRequest({
        track: input,
        addedToMaster,
        result: "swapped",
        position: action.to,
        spotifyPlaylistId: status.spotifyPlaylistId,
        activationId: status.activationId,
      });

      return completeSuccessfulRequest({
        session,
        liveView,
        request: input,
        result: "swapped",
        position: action.to,
        swapFrom: action.from,
        addedToMaster,
      });
    } else {
      const message =
        action.kind === "now_playing"
          ? "That song is playing now."
          : action.kind === "already_played"
            ? "That song has already been played tonight."
            : "That song is already coming up in tonight’s playlist.";
      const errorMessage =
        action.kind === "now_playing"
          ? "Track currently playing"
          : action.kind === "already_played"
            ? "Track already played"
            : "Track already queued";
      await logRequest({
        track: input,
        addedToMaster: false,
        result: "rejected",
        position: existing.position,
        spotifyPlaylistId: status.spotifyPlaylistId,
        activationId: status.activationId,
        errorMessage,
      });
      throw new SocialRequestError(message);
    }
  }

  await assertRequesterQuota(quotaArgs);

  const { addedToMaster } = await ensureTrackOnMaster({
    accessToken,
    track: { id: input.trackId, uri: input.uri },
    genre,
  });
  await applyLineDanceIfNeeded(input, genre);

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
      input.uri,
      {
        ...SOCIAL_PLAYLIST_MUTATE_OPTS,
        cachedSnapshotId,
      }
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
      activationId: status.activationId,
    });

    return completeSuccessfulRequest({
      session,
      liveView,
      request: input,
      result: "replaced",
      position: target.position,
      purgePositions: purgePositions.length ? purgePositions : undefined,
      addedToMaster,
    });
  }

  // Append
  await addTracksToPlaylist(accessToken, status.spotifyPlaylistId, [
    input.uri,
  ]);
  try {
    await fetchPlaylistSnapshotIdOnly(accessToken, status.spotifyPlaylistId);
  } catch (err) {
    console.warn("Could not refresh playlist snapshot after append:", err);
  }
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
    activationId: status.activationId,
  });

  return completeSuccessfulRequest({
    session,
    liveView,
    request: input,
    result: "appended",
    position,
    purgePositions: purgePositions.length ? purgePositions : undefined,
    addedToMaster,
  });
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
