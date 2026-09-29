import { normalizeIsrc } from "@/lib/musicae/isrc";
import type {
  MusicaeAnalysisStatus,
  TrackAudioAnalysisRow,
} from "@/lib/musicae/types";

const ANALYSIS_STATUS_RANK: Record<MusicaeAnalysisStatus, number> = {
  complete: 4,
  not_found: 3,
  temporary_error: 2,
  missing_isrc: 1,
};

/** One row per ISRC — Postgres upsert cannot update the same PK twice in one statement. */
export function dedupeAnalysisRowsByIsrc(
  rows: TrackAudioAnalysisRow[]
): TrackAudioAnalysisRow[] {
  const byIsrc = new Map<string, TrackAudioAnalysisRow>();
  for (const row of rows) {
    const key = normalizeIsrc(row.isrc) ?? row.isrc;
    if (!key) continue;
    const existing = byIsrc.get(key);
    if (!existing) {
      byIsrc.set(key, row);
      continue;
    }
    const existingRank = ANALYSIS_STATUS_RANK[existing.analysis_status] ?? 0;
    const incomingRank = ANALYSIS_STATUS_RANK[row.analysis_status] ?? 0;
    if (incomingRank > existingRank) {
      byIsrc.set(key, row);
    }
  }
  return [...byIsrc.values()];
}
