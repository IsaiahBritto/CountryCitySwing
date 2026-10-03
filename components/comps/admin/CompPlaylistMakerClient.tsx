"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline } from "@/lib/comps/buttonStyles";
import { isCompAdminRole, type MeResponse } from "@/lib/comps/compAccessClient";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";
import { getSlotLabel, ROUND_SLOT_ORDER } from "@/lib/comps/roundChain";
import {
  BPM_RANGES,
  ENERGY_RANGES,
  energyFilterActive,
  normalizeEnergyTiers,
} from "@/lib/spotify/compCriteria";
import {
  defaultRoundConfigs,
  BPM_SLOT_TIERS,
  SONG_CRITERIA_TIERS,
  type BpmSlotTier,
  type CompPlaylistConfig,
  type CompPlaylistEntry,
  type CompPlaylistRoundConfig,
  type CompPlaylistSongSlot,
  type SongCriteriaTier,
} from "@/lib/spotify/compPlaylistTypes";
import { countRequiredTracks } from "@/lib/spotify/curateComp";
import GeneratedCompPlaylistPreview from "@/components/comps/admin/GeneratedCompPlaylistPreview";

type CompetitionOption = {
  id: string;
  name: string;
  comp_type: string;
  status: string;
};

type EventInfo = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
  type?: string | null;
};

type OwnedPlaylist = {
  id: string;
  name: string;
  url: string;
  trackCount: number | null;
};

type ConfigMeta = {
  lastSpotifyPlaylistId: string | null;
  lastSpotifyPlaylistUrl: string | null;
  lastGeneratedAt: string | null;
  updatedAt: string | null;
};

type GenerateResult = {
  id: string;
  url: string;
  durationMs: number;
  trackCount: number;
  lookedUp: number;
  stillUnknown: number;
  skippedNoBpm: number;
  entries: CompPlaylistEntry[];
  meta?: ConfigMeta;
};

type SyncFeaturesResult = {
  scanned: number;
  lookedUp: number;
  stillUnknown: number;
  playlists: {
    playlistId: string;
    label: string | null;
    scanned: number;
    lookedUp: number;
    stillUnknown: number;
  }[];
};

const BPM_SLOT_LABEL: Record<BpmSlotTier, string> = {
  low: "Low 60–80",
  mid: "Mid 81–119",
  high: "High 120–160",
  slow_and_fast: "Slow + fast (60–80 or 120–160)",
};

const ENERGY_LABEL: Record<SongCriteriaTier, string> = {
  low: "Low 0–0.40",
  mid: "Mid 0.41–0.65",
  high: "High 0.66–1.0",
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

function defaultConfig(): CompPlaylistConfig {
  return {
    allowedPlaylistIds: [],
    excludedPlaylistIds: [],
    rounds: defaultRoundConfigs(),
  };
}

function resizeSongStructure(
  structure: CompPlaylistSongSlot[],
  songsPerHeat: number
): CompPlaylistSongSlot[] {
  const next = structure.slice(0, songsPerHeat);
  while (next.length < songsPerHeat) {
    const index = next.length;
    next.push({
      bpm: index === 0 ? "low" : index === 1 ? "mid" : "high",
      energy: [],
    });
  }
  return next;
}

function toggleEnergyTier(
  slot: CompPlaylistSongSlot,
  tier: SongCriteriaTier,
  checked: boolean
): CompPlaylistSongSlot {
  const set = new Set(slot.energy);
  if (checked) set.add(tier);
  else set.delete(tier);
  return {
    ...slot,
    energy: SONG_CRITERIA_TIERS.filter((value) => set.has(value)),
  };
}

function energyCheckboxChecked(
  slot: CompPlaylistSongSlot,
  tier: SongCriteriaTier
): boolean {
  if (!energyFilterActive(slot.energy)) return false;
  return slot.energy.includes(tier);
}

function PlaylistMultiSelect({
  label,
  description,
  playlists,
  selectedIds,
  onChange,
  disabled,
  minSelected = 0,
}: {
  label: string;
  description?: string;
  playlists: OwnedPlaylist[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  minSelected?: number;
}) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= minSelected) return;
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-neutral-200">{label}</div>
        {description && (
          <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
        )}
      </div>
      {playlists.length === 0 ? (
        <p className="text-sm text-neutral-500">No owned playlists found.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-neutral-700 bg-neutral-900/50 p-2">
          {playlists.map((playlist) => {
            const checked = selectedIds.includes(playlist.id);
            return (
              <label
                key={playlist.id}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-neutral-800/60"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(playlist.id)}
                  className="mt-1"
                />
                <span className="text-sm text-neutral-200">
                  {playlist.name}
                  {playlist.trackCount != null ? (
                    <span className="text-neutral-500">
                      {" "}
                      ({playlist.trackCount})
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CompPlaylistMakerClient({
  eventId,
}: {
  eventId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");
  const [config, setConfig] = useState<CompPlaylistConfig>(defaultConfig);
  const [meta, setMeta] = useState<ConfigMeta | null>(null);
  const [ownedPlaylists, setOwnedPlaylists] = useState<OwnedPlaylist[]>([]);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [lookupFeatures, setLookupFeatures] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [syncingAnalysis, setSyncingAnalysis] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncFeaturesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(
    null
  );

  const isAdmin = isCompAdminRole(me?.profile?.role);

  const loadOwnedPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    try {
      const res = await authedFetch("/api/spotify/playlists");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (body as { error?: string }).error ?? "Failed to list playlists"
        );
      }
      setOwnedPlaylists(
        ((body as { playlists?: OwnedPlaylist[] }).playlists ?? []) as OwnedPlaylist[]
      );
    } catch (err) {
      console.error(err);
      setOwnedPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  const loadSetup = useCallback(async () => {
    const res = await authedFetch(
      `/api/admin/comps/events/${eventId}/playlist-setup`
    );
    if (!res.ok) throw new Error(await apiError(res));
    const data = await res.json();
    setEvent(data.event ?? null);
    const list = (data.competitions ?? []) as CompetitionOption[];
    setCompetitions(list);
    setSpotifyConnected(Boolean(data.spotifyConnected));
    setSelectedCompetitionId((prev) => {
      if (prev && list.some((c) => c.id === prev)) return prev;
      return list[0]?.id ?? "";
    });
  }, [eventId]);

  const loadConfig = useCallback(
    async (competitionId: string) => {
      if (!competitionId) {
        setConfig(defaultConfig());
        setMeta(null);
        return;
      }
      setLoadingConfig(true);
      setError(null);
      try {
        const res = await authedFetch(
          `/api/admin/comps/${competitionId}/playlist-config?event_id=${encodeURIComponent(eventId)}`
        );
        if (!res.ok) throw new Error(await apiError(res));
        const data = await res.json();
        setConfig((data.config as CompPlaylistConfig) ?? defaultConfig());
        setMeta((data.meta as ConfigMeta) ?? null);
        setGenerateResult(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load config");
      } finally {
        setLoadingConfig(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const meRes = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const meData = meRes.ok ? await meRes.json() : null;
      setMe(meData);
      if (isCompAdminRole(meData?.profile?.role)) {
        try {
          await loadSetup();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load setup");
        }
      }
      setLoading(false);
    })();
  }, [loadSetup]);

  useEffect(() => {
    if (spotifyConnected && isAdmin) {
      void loadOwnedPlaylists();
    }
  }, [spotifyConnected, isAdmin, loadOwnedPlaylists]);

  useEffect(() => {
    if (!isAdmin || !selectedCompetitionId) return;
    void loadConfig(selectedCompetitionId);
  }, [isAdmin, selectedCompetitionId, loadConfig]);

  const requiredTracks = useMemo(
    () => countRequiredTracks(config.rounds.filter((round) => round.enabled)),
    [config.rounds]
  );

  const updateRound = (
    roundType: CompPlaylistRoundConfig["roundType"],
    patch: Partial<CompPlaylistRoundConfig>
  ) => {
    setConfig((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round) =>
        round.roundType === roundType ? { ...round, ...patch } : round
      ),
    }));
  };

  const updateSongSlot = (
    roundType: CompPlaylistRoundConfig["roundType"],
    songIndex: number,
    patch: Partial<CompPlaylistSongSlot>
  ) => {
    setConfig((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round) => {
        if (round.roundType !== roundType) return round;
        const songStructure = round.songStructure.map((slot, index) =>
          index === songIndex ? { ...slot, ...patch } : slot
        );
        return { ...round, songStructure };
      }),
    }));
  };

  const handleSongsPerHeatChange = (
    roundType: CompPlaylistRoundConfig["roundType"],
    value: number
  ) => {
    const songsPerHeat = Math.max(1, Math.floor(value) || 1);
    setConfig((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round) =>
        round.roundType === roundType
          ? {
              ...round,
              songsPerHeat,
              songStructure: resizeSongStructure(
                round.songStructure,
                songsPerHeat
              ),
            }
          : round
      ),
    }));
  };

  const saveConfig = async () => {
    if (!selectedCompetitionId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authedFetch(
        `/api/admin/comps/${selectedCompetitionId}/playlist-config`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...config, event_id: eventId }),
        }
      );
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json();
      setConfig((data.config as CompPlaylistConfig) ?? config);
      setMeta((data.meta as ConfigMeta) ?? null);
      setSuccess("Configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const syncAllowedPlaylists = async () => {
    if (config.allowedPlaylistIds.length === 0) return;
    setSyncingAnalysis(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await authedFetch("/api/spotify/sync-features", {
        method: "POST",
        body: JSON.stringify({
          playlistIds: config.allowedPlaylistIds,
        }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      setSyncResult((await res.json()) as SyncFeaturesResult);
      setSuccess("Musicae analysis synced for allowed playlists.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync Musicae analysis"
      );
    } finally {
      setSyncingAnalysis(false);
    }
  };

  const generatePlaylist = async () => {
    if (!selectedCompetitionId) return;
    setGenerating(true);
    setError(null);
    setSuccess(null);
    setGenerateResult(null);
    try {
      const res = await authedFetch(
        `/api/admin/comps/${selectedCompetitionId}/playlist-generate`,
        {
          method: "POST",
          body: JSON.stringify({
            event_id: eventId,
            config,
            lookupFeatures,
          }),
        }
      );
      if (!res.ok) throw new Error(await apiError(res));
      const data = (await res.json()) as GenerateResult;
      setGenerateResult(data);
      if (data.meta) setMeta(data.meta);
      setSuccess("Playlist generated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate playlist"
      );
    } finally {
      setGenerating(false);
    }
  };

  const busy =
    saving ||
    generating ||
    syncingAnalysis ||
    loadingConfig ||
    loadingPlaylists;

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-neutral-400">
        Loading…
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-red-300">Admin access required.</p>
        <Link href="/auth" className="mt-2 inline-block text-sm text-primary">
          Sign in
        </Link>
      </main>
    );
  }

  const scheduleLabel = event?.starts_at
    ? formatEventScheduleSubtitle(
        event.starts_at,
        event.ends_at,
        event.time_zone || DEFAULT_TIME_ZONE,
        event.type ?? "comp"
      )
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/admin/comps"
        className="mb-4 inline-block text-sm text-neutral-400 hover:text-white"
      >
        ← Back to competitions
      </Link>

      <h1 className="text-2xl font-bold text-white">Competition playlists</h1>
      {event && (
        <>
          <p className="mt-1 text-lg text-neutral-200">{event.title}</p>
          {scheduleLabel && (
            <p className="mt-0.5 text-sm text-neutral-400">{scheduleLabel}</p>
          )}
        </>
      )}

      <p className="mt-3 text-sm text-neutral-400">
        Build private Spotify playlists per division from your owned playlists.
        Configure rounds, heats, and per-song BPM/energy criteria, then generate.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
          {success}
        </div>
      )}

      <section className="mt-6 space-y-3 rounded-xl border border-neutral-700 bg-neutral-800/40 p-5">
        <h2 className="text-lg font-semibold text-white">Spotify account</h2>
        {spotifyConnected ? (
          <p className="text-sm text-neutral-300">
            Connected. Owned playlists are available for the song pool.
          </p>
        ) : (
          <p className="text-sm text-neutral-400">
            Connect Spotify before generating playlists.
          </p>
        )}
        <Link href="/spotify" className={compBtnOutline + " inline-block text-sm"}>
          {spotifyConnected ? "Manage Spotify connection" : "Connect Spotify"}
        </Link>
      </section>

      <section className="mt-6 space-y-4 rounded-xl border border-neutral-700 bg-neutral-800/40 p-5">
        <h2 className="text-lg font-semibold text-white">Competition</h2>
        {competitions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No divisions on this event yet.
          </p>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm text-neutral-400">Division</span>
            <select
              value={selectedCompetitionId}
              onChange={(e) => setSelectedCompetitionId(e.target.value)}
              disabled={busy}
              className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
            >
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {loadingConfig && (
          <p className="text-sm text-neutral-500">Loading saved config…</p>
        )}
      </section>

      {selectedCompetitionId && (
        <>
          <section className="mt-6 space-y-5 rounded-xl border border-neutral-700 bg-neutral-800/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Song pool</h2>
              <button
                type="button"
                onClick={() => void loadOwnedPlaylists()}
                disabled={busy || !spotifyConnected}
                className="rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 hover:border-primary/60 disabled:opacity-50"
              >
                {loadingPlaylists ? "Refreshing…" : "Refresh playlists"}
              </button>
            </div>

            <PlaylistMultiSelect
              label="Allowed playlists"
              description="Tracks from these playlists form the song pool (minimum 1). Only tracks with Musicae BPM are eligible."
              playlists={ownedPlaylists}
              selectedIds={config.allowedPlaylistIds}
              onChange={(ids) =>
                setConfig((prev) => ({ ...prev, allowedPlaylistIds: ids }))
              }
              disabled={busy || !spotifyConnected}
              minSelected={0}
            />

            <PlaylistMultiSelect
              label="Excluded playlists"
              description="Songs on these playlists are removed from the pool even if they appear in an allowed playlist."
              playlists={ownedPlaylists}
              selectedIds={config.excludedPlaylistIds}
              onChange={(ids) =>
                setConfig((prev) => ({ ...prev, excludedPlaylistIds: ids }))
              }
              disabled={busy || !spotifyConnected}
            />

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void syncAllowedPlaylists()}
                disabled={
                  busy ||
                  !spotifyConnected ||
                  config.allowedPlaylistIds.length === 0
                }
                className={compBtnOutline + " text-sm disabled:opacity-50"}
              >
                {syncingAnalysis
                  ? "Syncing Musicae analysis…"
                  : "Sync Musicae analysis for allowed playlists"}
              </button>
              <p className="text-xs text-neutral-500">
                Warms the analysis cache before generate (no quota on generate
                when lookup is off).
              </p>
            </div>
            {syncResult && (
              <p className="text-sm text-neutral-400">
                Synced {syncResult.scanned} track(s); looked up{" "}
                {syncResult.lookedUp}; still unknown {syncResult.stillUnknown}.
              </p>
            )}
          </section>

          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Rounds</h2>
              <p className="text-sm text-neutral-500">
                {requiredTracks} song slot{requiredTracks === 1 ? "" : "s"}{" "}
                required
              </p>
            </div>
            <p className="text-xs text-neutral-500">
              Slow + fast excludes mid BPM (81–119); use energy to differentiate
              songs in that slot.
            </p>

            {ROUND_SLOT_ORDER.map((roundType) => {
              const round =
                config.rounds.find((item) => item.roundType === roundType) ??
                defaultRoundConfigs().find((item) => item.roundType === roundType)!;

              return (
                <div
                  key={roundType}
                  className="space-y-4 rounded-xl border border-neutral-700 bg-neutral-800/40 p-5"
                >
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={round.enabled}
                      disabled={busy}
                      onChange={(e) =>
                        updateRound(roundType, { enabled: e.target.checked })
                      }
                    />
                    <span className="font-semibold">
                      {getSlotLabel(roundType)}
                    </span>
                  </label>

                  {round.enabled && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block space-y-1">
                          <span className="text-sm text-neutral-400">
                            Heats
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={round.heatCount}
                            disabled={busy}
                            onChange={(e) =>
                              updateRound(roundType, {
                                heatCount: Math.max(
                                  1,
                                  Math.floor(Number(e.target.value)) || 1
                                ),
                              })
                            }
                            className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-sm text-neutral-400">
                            Songs per heat
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={round.songsPerHeat}
                            disabled={busy}
                            onChange={(e) =>
                              handleSongsPerHeatChange(
                                roundType,
                                Number(e.target.value)
                              )
                            }
                            className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-sm">
                          <thead>
                            <tr className="text-left text-xs uppercase text-neutral-500">
                              <th className="py-2 pr-4">Song</th>
                              <th className="py-2 pr-4">BPM range</th>
                              <th className="py-2">Energy (optional)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {round.songStructure.map((slot, songIndex) => (
                              <tr
                                key={`${roundType}-${songIndex}`}
                                className="border-t border-neutral-800"
                              >
                                <td className="py-3 pr-4 text-neutral-300">
                                  Song {songIndex + 1}
                                </td>
                                <td className="py-3 pr-4">
                                  <select
                                    value={slot.bpm}
                                    disabled={busy}
                                    onChange={(e) =>
                                      updateSongSlot(roundType, songIndex, {
                                        bpm: e.target.value as BpmSlotTier,
                                      })
                                    }
                                    className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1.5 text-sm text-white"
                                  >
                                    {BPM_SLOT_TIERS.map((tier) => (
                                      <option key={tier} value={tier}>
                                        {tier === "slow_and_fast"
                                          ? BPM_SLOT_LABEL[tier]
                                          : `${BPM_SLOT_LABEL[tier]} (${BPM_RANGES[tier].min}–${BPM_RANGES[tier].max})`}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-3">
                                  <div className="flex flex-wrap gap-3">
                                    {SONG_CRITERIA_TIERS.map((tier) => (
                                      <label
                                        key={tier}
                                        className="flex items-center gap-1.5 text-xs text-neutral-300"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={energyCheckboxChecked(
                                            slot,
                                            tier
                                          )}
                                          disabled={busy}
                                          onChange={(e) =>
                                            updateSongSlot(
                                              roundType,
                                              songIndex,
                                              toggleEnergyTier(
                                                slot,
                                                tier,
                                                e.target.checked
                                              )
                                            )
                                          }
                                        />
                                        {ENERGY_LABEL[tier]}
                                      </label>
                                    ))}
                                  </div>
                                  <p className="mt-1 text-xs text-neutral-500">
                                    {energyFilterActive(slot.energy)
                                      ? `Filtering: ${normalizeEnergyTiers(slot.energy)?.map((tier) => ENERGY_LABEL[tier]).join(" or ")}`
                                      : "Any energy (none or all tiers selected)"}
                                  </p>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </section>

          <section className="mt-6 space-y-4 rounded-xl border border-neutral-700 bg-neutral-800/40 p-5">
            <h2 className="text-lg font-semibold text-white">Generate</h2>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={lookupFeatures}
                disabled={busy}
                onChange={(e) => setLookupFeatures(e.target.checked)}
                className="mt-1"
              />
              <span>
                Lookup missing BPM/energy via Musicae (ISRC)
                <span className="mt-0.5 block text-xs text-neutral-500">
                  Leave off to generate from the synced cache only (faster, no
                  Musicae quota). Sync first for best results. When on, only
                  tracks missing Musicae BPM or energy are looked up.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveConfig()}
                disabled={busy}
                className={compBtnOutline + " text-sm disabled:opacity-50"}
              >
                {saving ? "Saving…" : "Save config"}
              </button>
              <button
                type="button"
                onClick={() => void generatePlaylist()}
                disabled={
                  busy ||
                  !spotifyConnected ||
                  config.allowedPlaylistIds.length === 0
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {generating
                  ? lookupFeatures
                    ? "Generating… (may take a few minutes)"
                    : "Generating…"
                  : "Generate playlist"}
              </button>
            </div>

            {meta?.lastSpotifyPlaylistUrl && (
              <div className="text-sm text-neutral-300">
                <p>
                  Last generated
                  {meta.lastGeneratedAt
                    ? `: ${new Date(meta.lastGeneratedAt).toLocaleString()}`
                    : ""}
                </p>
                <a
                  href={meta.lastSpotifyPlaylistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Open last playlist in Spotify
                </a>
              </div>
            )}

            {generateResult && (
              <div className="rounded border border-neutral-700 bg-neutral-900/60 p-4 text-sm text-neutral-300">
                <p>
                  Created {generateResult.trackCount} tracks (
                  {formatDuration(generateResult.durationMs)}). Gap-fill looked
                  up {generateResult.lookedUp}; still unknown{" "}
                  {generateResult.stillUnknown}.
                </p>
                {generateResult.stillUnknown > 0 && (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Some tracks still lack Musicae BPM or energy after lookup.
                    Sync or enable lookup to grow the eligible pool.
                  </p>
                )}
                {generateResult.skippedNoBpm > 0 && (
                  <p className="mt-2 text-xs text-neutral-400">
                    {generateResult.skippedNoBpm} track(s) in the allowed
                    playlists were skipped (no Musicae BPM).
                  </p>
                )}
                <a
                  href={generateResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-primary hover:underline"
                >
                  Open playlist in Spotify
                </a>
                {generateResult.entries?.length > 0 && (
                  <GeneratedCompPlaylistPreview entries={generateResult.entries} />
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
