import { getSlotLabel } from "@/lib/comps/roundChain";
import type { DanceRole, RoundType, ScoringScope } from "@/lib/comps/types";

export interface JudgeRoundRow {
  id: string;
  round_type: string;
  judged_role: DanceRole | null;
  round_order?: number;
  status: string;
  sheetStatus: "draft" | "submitted" | null;
  readyToJudge: boolean;
  siblingRound?: { id: string; judged_role: DanceRole } | null;
}

export interface JudgeRoundSlot {
  /** Stable key for React list rendering */
  key: string;
  label: string;
  roundId: string;
  readyToJudge: boolean;
  statusLabel: string;
}

function roundStatusLabel(r: JudgeRoundRow): string {
  if (r.readyToJudge) return "Ready to judge";
  if (r.status === "open" && r.sheetStatus === "submitted") return "Submitted";
  if (r.status === "checkin") return "Check-in";
  if (r.status === "closed") return "Closed";
  if (r.status === "tabulated" || r.status === "published") return "Done";
  return r.status;
}

function mergeStatusLabel(lead: JudgeRoundRow, follow: JudgeRoundRow): string {
  if (lead.readyToJudge || follow.readyToJudge) return "Ready to judge";
  const leadLabel = roundStatusLabel(lead);
  const followLabel = roundStatusLabel(follow);
  if (leadLabel === followLabel) return leadLabel;
  if (leadLabel === "Submitted" && followLabel === "Submitted") return "Submitted";
  if (leadLabel === "Done" && followLabel === "Done") return "Done";
  return `${leadLabel} / ${followLabel}`;
}

function pickRoundId(lead: JudgeRoundRow, follow: JudgeRoundRow): string {
  if (lead.readyToJudge) return lead.id;
  if (follow.readyToJudge) return follow.id;
  return lead.id;
}

function slotKey(r: JudgeRoundRow): string {
  return `${r.round_type}:${r.round_order ?? 0}`;
}

/**
 * Collapse JnJ lead/follow pairs into one assignment row when the judge
 * scores both roles. Single-role assignments and non-paired rounds pass through.
 */
export function groupJudgeRoundSlots(
  rounds: JudgeRoundRow[],
  scoringScope: ScoringScope
): JudgeRoundSlot[] {
  if (scoringScope !== "both") {
    return rounds.map((r) => ({
      key: r.id,
      label:
        r.judged_role != null
          ? `${getSlotLabel(r.round_type as RoundType)} — ${r.judged_role === "lead" ? "Leads" : "Follows"}`
          : getSlotLabel(r.round_type as RoundType),
      roundId: r.id,
      readyToJudge: r.readyToJudge,
      statusLabel: roundStatusLabel(r),
    }));
  }

  const byId = new Map(rounds.map((r) => [r.id, r]));
  const consumed = new Set<string>();
  const slots: JudgeRoundSlot[] = [];

  for (const r of rounds) {
    if (consumed.has(r.id)) continue;

    const siblingId = r.siblingRound?.id;
    const sibling = siblingId ? byId.get(siblingId) : undefined;

    if (r.judged_role != null && sibling && sibling.judged_role != null) {
      consumed.add(r.id);
      consumed.add(sibling.id);
      const lead = r.judged_role === "lead" ? r : sibling;
      const follow = r.judged_role === "follow" ? r : sibling;
      slots.push({
        key: slotKey(lead),
        label: getSlotLabel(lead.round_type as RoundType),
        roundId: pickRoundId(lead, follow),
        readyToJudge: lead.readyToJudge || follow.readyToJudge,
        statusLabel: mergeStatusLabel(lead, follow),
      });
      continue;
    }

    slots.push({
      key: r.id,
      label: getSlotLabel(r.round_type as RoundType),
      roundId: r.id,
      readyToJudge: r.readyToJudge,
      statusLabel: roundStatusLabel(r),
    });
  }

  return slots;
}
