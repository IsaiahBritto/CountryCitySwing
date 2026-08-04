import { supabaseServer } from "@/lib/supabaseServer";
import type { CallbackValue } from "@/lib/comps/types";
import type { JudgeOrdinalSheet, JudgeVoteSheet } from "./sheetTypes";
import type { EntrySlot } from "./types";
import { roundEntrySlotMap } from "./entryMapping";
import type { SlotMap } from "./types";

export async function submitCallbackScores(
  roundId: string,
  panelAssignmentIds: string[],
  judgeVotes: JudgeVoteSheet[],
  entrySlots: SlotMap,
  cjAssignmentId?: string | null,
  cjVotes?: JudgeVoteSheet
) {
  const { data: roundEntries } = await supabaseServer
    .from("comp_round_entries")
    .select("id, entry_id")
    .eq("round_id", roundId);

  const reBySlot = roundEntrySlotMap(roundEntries ?? [], entrySlots);

  for (let j = 0; j < panelAssignmentIds.length; j++) {
    const assignmentId = panelAssignmentIds[j];
    const sheet = judgeVotes[j] ?? {};
    const rows = [...reBySlot.entries()].map(([slot, roundEntryId]) => ({
      round_id: roundId,
      judge_assignment_id: assignmentId,
      round_entry_id: roundEntryId,
      callback_value: (sheet[slot] ?? "no") as CallbackValue,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      await supabaseServer.from("comp_scores").upsert(rows, {
        onConflict: "round_id,judge_assignment_id,round_entry_id",
      });
    }
    await supabaseServer.from("comp_judge_sheets").upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: assignmentId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id" }
    );
  }

  if (cjAssignmentId && cjVotes) {
    const rows = [...reBySlot.entries()].map(([slot, roundEntryId]) => ({
      round_id: roundId,
      judge_assignment_id: cjAssignmentId,
      round_entry_id: roundEntryId,
      callback_value: (cjVotes[slot] ?? "no") as CallbackValue,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      await supabaseServer.from("comp_scores").upsert(rows, {
        onConflict: "round_id,judge_assignment_id,round_entry_id",
      });
    }
    await supabaseServer.from("comp_judge_sheets").upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: cjAssignmentId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id" }
    );
  }
}

export async function submitOrdinalScores(
  roundId: string,
  panelAssignmentIds: string[],
  judgeOrdinals: JudgeOrdinalSheet[],
  entrySlots: SlotMap,
  cjAssignmentId?: string | null,
  cjOrdinals?: Partial<Record<EntrySlot, number>>
) {
  const { data: roundEntries } = await supabaseServer
    .from("comp_round_entries")
    .select("id, entry_id, scratched")
    .eq("round_id", roundId);

  const active = (roundEntries ?? []).filter((re) => !re.scratched);
  const reBySlot = roundEntrySlotMap(active, entrySlots);
  const slotOrder = entrySlots.slots.filter((s) => reBySlot.has(s));

  const resolveOrdinal = (sheet: JudgeOrdinalSheet, slot: EntrySlot): number => {
    const ord = sheet[slot];
    if (ord == null) {
      throw new Error(`Missing ordinal for slot ${slot}`);
    }
    return ord;
  };

  for (let j = 0; j < panelAssignmentIds.length; j++) {
    const assignmentId = panelAssignmentIds[j];
    const sheet = judgeOrdinals[j] ?? {};
    const rows = slotOrder.map((slot) => ({
      round_id: roundId,
      judge_assignment_id: assignmentId,
      round_entry_id: reBySlot.get(slot)!,
      ordinal: resolveOrdinal(sheet, slot),
      updated_at: new Date().toISOString(),
    }));
    await supabaseServer.from("comp_scores").upsert(rows, {
      onConflict: "round_id,judge_assignment_id,round_entry_id",
    });
    await supabaseServer.from("comp_judge_sheets").upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: assignmentId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id" }
    );
  }

  if (cjAssignmentId && cjOrdinals) {
    const rows = slotOrder.map((slot) => ({
      round_id: roundId,
      judge_assignment_id: cjAssignmentId,
      round_entry_id: reBySlot.get(slot)!,
      ordinal: resolveOrdinal(cjOrdinals, slot),
      updated_at: new Date().toISOString(),
    }));
    await supabaseServer.from("comp_scores").upsert(rows, {
      onConflict: "round_id,judge_assignment_id,round_entry_id",
    });
    await supabaseServer.from("comp_judge_sheets").upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: cjAssignmentId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id" }
    );
  }
}
