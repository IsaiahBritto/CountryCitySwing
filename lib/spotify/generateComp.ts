import { getSlotLabel } from "@/lib/comps/roundChain";
import { supabaseServer } from "@/lib/supabaseServer";
import { DEFAULT_TIME_ZONE, formatEventDate } from "@/lib/utils/dateHelpers";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  createPrivatePlaylist,
} from "@/lib/spotify/client";
import { buildCompPool } from "@/lib/spotify/compPool";
import { evaluateSlotMatch, formatSlotCriteria } from "@/lib/spotify/compCriteria";
import {
  countRequiredTracks,
  curateCompPlaylist,
} from "@/lib/spotify/curateComp";
import type {
  CompPlaylistConfig,
  CompPlaylistEntry,
} from "@/lib/spotify/compPlaylistTypes";

export type GenerateCompPlaylistResult = {
  id: string;
  url: string;
  durationMs: number;
  trackCount: number;
  lookedUp: number;
  stillUnknown: number;
  skippedNoBpm: number;
  entries: CompPlaylistEntry[];
};

function buildPlaylistTitle(
  eventStartsAt: string,
  eventTimeZone: string | null | undefined,
  competitionName: string
): string {
  const tz = eventTimeZone || DEFAULT_TIME_ZONE;
  const dateLabel = formatEventDate(eventStartsAt, tz, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const title = `${dateLabel} — ${competitionName.trim()}`;
  if (title.length <= 100) return title;
  return title.slice(0, 100);
}

export async function generateCompPlaylist(input: {
  competitionId: string;
  config: CompPlaylistConfig;
  lookupFeatures?: boolean;
}): Promise<GenerateCompPlaylistResult> {
  const { data: competition, error: compError } = await supabaseServer
    .from("competitions")
    .select("id, name, event:events(id, starts_at, time_zone)")
    .eq("id", input.competitionId)
    .single();

  if (compError || !competition) {
    throw new Error("Competition not found");
  }

  const rawEvent = competition.event as
    | { id: string; starts_at: string; time_zone?: string | null }
    | { id: string; starts_at: string; time_zone?: string | null }[]
    | null;
  const event = Array.isArray(rawEvent) ? (rawEvent[0] ?? null) : rawEvent;
  if (!event?.starts_at) {
    throw new Error("Competition event date is missing");
  }

  const enabledRounds = input.config.rounds.filter((round) => round.enabled);
  const required = countRequiredTracks(enabledRounds);
  if (required === 0) {
    throw new Error("Enable at least one round with songs");
  }

  const poolResult = await buildCompPool({
    allowedPlaylistIds: input.config.allowedPlaylistIds,
    excludedPlaylistIds: input.config.excludedPlaylistIds,
    lookupFeatures: input.lookupFeatures,
  });

  if (poolResult.tracks.length < required) {
    const skipped =
      poolResult.skippedNoBpm > 0
        ? ` ${poolResult.skippedNoBpm} track(s) skipped (no Musicae BPM). Sync analysis or enable lookup on generate.`
        : "";
    throw new Error(
      `Eligible song pool has ${poolResult.tracks.length} track(s) with Musicae BPM but ${required} are required.${skipped}`
    );
  }

  let curated;
  try {
    curated = curateCompPlaylist(poolResult.tracks, enabledRounds);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to curate playlist";
    throw new Error(message);
  }

  const entries: CompPlaylistEntry[] = curated.tracks.map((row) => {
    const evaluation = evaluateSlotMatch(row.features, row.slot);
    return {
      roundType: row.roundType,
      heatNumber: row.heatNumber,
      songNumber: row.songNumber,
      slot: row.slot,
      slotLabel: formatSlotCriteria(row.slot),
      track: {
        id: row.id,
        name: row.name,
        primaryArtist: row.primaryArtist,
        uri: row.uri,
      },
      bpm: row.features.bpm,
      energy: row.features.energy,
      trueBpm: row.features.trueBpm,
      trueEnergy: row.features.trueEnergy,
      bpmOk: evaluation.bpmOk,
      energyOk: evaluation.energyOk,
      matchesSlot: evaluation.matchesSlot,
    };
  });

  const playlistName = buildPlaylistTitle(
    event.starts_at,
    event.time_zone,
    competition.name
  );

  const { accessToken } = await getValidAccessToken();
  const created = await createPrivatePlaylist(
    accessToken,
    playlistName,
    `Country City Swing competition playlist — ${competition.name}`
  );

  await addTracksToPlaylist(
    accessToken,
    created.id,
    curated.tracks.map((track) => track.uri)
  );

  const now = new Date().toISOString();
  const { error: saveError } = await supabaseServer
    .from("comp_playlist_configs")
    .upsert(
      {
        competition_id: input.competitionId,
        allowed_playlist_ids: input.config.allowedPlaylistIds,
        excluded_playlist_ids: input.config.excludedPlaylistIds,
        rounds: input.config.rounds,
        last_spotify_playlist_id: created.id,
        last_spotify_playlist_url: created.url,
        last_generated_at: now,
        updated_at: now,
      },
      { onConflict: "competition_id" }
    );

  if (saveError) {
    console.error("[generateCompPlaylist] failed to persist config", saveError);
  }

  return {
    id: created.id,
    url: created.url,
    durationMs: curated.durationMs,
    trackCount: curated.tracks.length,
    lookedUp: poolResult.lookedUp,
    stillUnknown: poolResult.stillUnknown,
    skippedNoBpm: poolResult.skippedNoBpm,
    entries,
  };
}

export function describeEnabledRounds(config: CompPlaylistConfig): string {
  return config.rounds
    .filter((round) => round.enabled)
    .map(
      (round) =>
        `${getSlotLabel(round.roundType)} (${round.heatCount} heat${round.heatCount === 1 ? "" : "s"} × ${round.songsPerHeat} songs)`
    )
    .join(", ");
}
