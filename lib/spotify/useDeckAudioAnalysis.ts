"use client";

import { useCallback, useRef } from "react";
import { authedFetchWithRetry } from "@/lib/clientAuth";
import type { DeckId, DeckTrack, DeckTrackAnalysisStatus } from "@/lib/spotify/djDeckState";
import type { DjDeckAction } from "@/lib/spotify/djDeckState";

type ApiAnalysisEntry = {
  status?: string;
  spotifyTrackId?: string;
  bpm?: number;
  camelot?: string | null;
  energy?: number;
};

function mapApiStatus(status: string | undefined): DeckTrackAnalysisStatus {
  if (status === "complete") return "complete";
  if (
    status === "not_found" ||
    status === "missing_isrc" ||
    status === "temporary_error" ||
    status === "unavailable"
  ) {
    return "unavailable";
  }
  return "unavailable";
}

/**
 * After a playlist loads, request Musicae-backed analysis without blocking playback.
 */
export function useDeckAudioAnalysis(
  dispatch: React.Dispatch<DjDeckAction>
) {
  const inflightRef = useRef<Set<string>>(new Set());

  const enrichPlaylist = useCallback(
    async (deck: DeckId, tracks: DeckTrack[]) => {
      if (tracks.length === 0) return;

      const needing = tracks.filter(
        (t) => t.analysisStatus !== "complete" && t.bpm == null
      );
      if (needing.length === 0) return;

      const key = `${deck}:${needing.map((t) => t.id).join(",")}`;
      if (inflightRef.current.has(key)) return;
      inflightRef.current.add(key);

      dispatch({
        type: "MERGE_TRACK_METADATA",
        deck,
        updates: needing.map((t) => ({
          id: t.id,
          analysisStatus: "pending" as const,
        })),
      });

      try {
        const res = await authedFetchWithRetry("/api/audio-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracks: needing.map((t) => ({
              spotifyTrackId: t.id,
              isrc: t.isrc ?? null,
            })),
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          tracks?: Record<string, ApiAnalysisEntry>;
          error?: string;
        };
        if (!res.ok) {
          console.warn("Deck audio analysis failed:", body.error ?? res.status);
          dispatch({
            type: "MERGE_TRACK_METADATA",
            deck,
            updates: needing.map((t) => ({
              id: t.id,
              analysisStatus: "unavailable" as const,
            })),
          });
          return;
        }

        const bySpotifyId = new Map<string, ApiAnalysisEntry>();
        for (const entry of Object.values(body.tracks ?? {})) {
          if (entry.spotifyTrackId) {
            bySpotifyId.set(entry.spotifyTrackId, entry);
          }
        }

        dispatch({
          type: "MERGE_TRACK_METADATA",
          deck,
          updates: needing.map((t) => {
            const entry = bySpotifyId.get(t.id);
            if (!entry) {
              return { id: t.id, analysisStatus: "unavailable" as const };
            }
            const analysisStatus = mapApiStatus(entry.status);
            return {
              id: t.id,
              ...(typeof entry.bpm === "number" ? { bpm: entry.bpm } : {}),
              analysisStatus,
            };
          }),
        });
      } catch (err) {
        console.warn("Deck audio analysis error:", err);
        dispatch({
          type: "MERGE_TRACK_METADATA",
          deck,
          updates: needing.map((t) => ({
            id: t.id,
            analysisStatus: "unavailable" as const,
          })),
        });
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [dispatch]
  );

  return { enrichPlaylist };
}
