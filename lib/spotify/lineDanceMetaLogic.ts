import {
  isLineDanceLevel,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";
export type LineDanceMatchSource = "none" | "user" | "admin" | "reviewer";

export type LineDanceCompletionStatus = "empty" | "partial" | "complete";

export type LineDanceReviewFilter = "all" | "empty" | "partial" | "complete";

export type ReviewerMetaInput = {
  lineDanceName?: string | null;
  level?: string | null;
};

type MergeExisting = {
  match_source: LineDanceMatchSource;
  line_dance_name: string | null;
  level: LineDanceLevel | null;
  level_raw: string | null;
};

export function lineDanceCompletionStatus(row: {
  line_dance_name: string | null;
  level: LineDanceLevel | null;
}): LineDanceCompletionStatus {
  const hasName = !!row.line_dance_name?.trim();
  const hasLevel = !!row.level;
  if (hasName && hasLevel) return "complete";
  if (hasName || hasLevel) return "partial";
  return "empty";
}

export function filterReviewRows<T extends {
  track_name: string | null;
  line_dance_name: string | null;
  level: LineDanceLevel | null;
}>(rows: T[], filter: LineDanceReviewFilter): T[] {
  if (filter === "all") return rows;
  return rows.filter((row) => lineDanceCompletionStatus(row) === filter);
}

export function sortReviewRowsByTrackName<T extends { track_name: string | null }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) =>
    (a.track_name ?? "").localeCompare(b.track_name ?? "", undefined, {
      sensitivity: "base",
    })
  );
}

export function computeReviewerMetaMerge(
  existing: MergeExisting,
  input: ReviewerMetaInput
):
  | {
      ok: true;
      line_dance_name: string | null;
      level: LineDanceLevel | null;
      level_raw: string | null;
      needs_recheck: boolean;
    }
  | { ok: false; reason: string } {
  if (existing.match_source === "admin") {
    return { ok: false, reason: "Admin-confirmed row cannot be modified" };
  }

  const nameProvided = input.lineDanceName !== undefined;
  const levelProvided = input.level !== undefined;

  const trimmedName =
    nameProvided && typeof input.lineDanceName === "string"
      ? input.lineDanceName.trim()
      : null;
  const levelValue =
    levelProvided && typeof input.level === "string" && input.level.trim()
      ? input.level.trim()
      : null;

  if (nameProvided && trimmedName === "") {
    return { ok: false, reason: "lineDanceName cannot be empty when provided" };
  }
  if (levelProvided && levelValue && !isLineDanceLevel(levelValue)) {
    return { ok: false, reason: "Invalid level" };
  }
  if (levelProvided && input.level === "") {
    return { ok: false, reason: "level cannot be empty when provided" };
  }

  const hasNameUpdate = nameProvided && !!trimmedName;
  const hasLevelUpdate =
    levelProvided && !!levelValue && isLineDanceLevel(levelValue);

  if (!hasNameUpdate && !hasLevelUpdate) {
    return {
      ok: false,
      reason: "At least one of lineDanceName or level is required",
    };
  }

  const line_dance_name = hasNameUpdate
    ? trimmedName
    : existing.line_dance_name;
  const level = hasLevelUpdate
    ? (levelValue as LineDanceLevel)
    : existing.level;
  const level_raw = hasLevelUpdate ? levelValue : existing.level_raw;

  const needs_recheck = !(line_dance_name && level);

  return {
    ok: true,
    line_dance_name,
    level,
    level_raw,
    needs_recheck,
  };
}
