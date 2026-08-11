import type { CompType, DanceRole, RoundType } from "@/lib/comps/types";

export type EdgeCaseType =
  | "advance_boundary_tie"
  | "alternate_boundary_tie"
  | "clean_callback"
  | "rp_head_to_head_break"
  | "rp_cycle_cj_break"
  | "rp_clean"
  | "jnj_scope_smoke";

export interface PlaybookEntry {
  edgeCase: EdgeCaseType;
  label: string;
  description: string;
}

const PLAYBOOK: Record<
  CompType,
  Partial<Record<RoundType, Partial<Record<DanceRole | "all", EdgeCaseType>>>>
> = {
  strictly: {
    prelims: { all: "advance_boundary_tie" },
    quarterfinal: { all: "clean_callback" },
    semifinal: { all: "alternate_boundary_tie" },
    final: { all: "rp_cycle_cj_break" },
  },
  jack_and_jill: {
    prelims: { lead: "advance_boundary_tie", follow: "clean_callback" },
    quarterfinal: { lead: "clean_callback", follow: "clean_callback" },
    semifinal: { lead: "alternate_boundary_tie", follow: "alternate_boundary_tie" },
    final: { all: "jnj_scope_smoke" },
  },
};

const EDGE_META: Record<
  EdgeCaseType,
  { label: string; description: string }
> = {
  advance_boundary_tie: {
    label: "Advance boundary tie",
    description:
      "Panel tie at the advance cut; CJ vote matches on the tied pair and cannot break it. Resolve in tie UI, then confirm tabulate.",
  },
  alternate_boundary_tie: {
    label: "Alternate boundary tie",
    description:
      "Panel tie at the alternate boundary; CJ vote matches on the tied pair and cannot break it. Resolve alternates manually, then confirm.",
  },
  clean_callback: {
    label: "Clean callback",
    description:
      "Tabulate should succeed with clear advance/alternate separation and no tie resolution UI.",
  },
  rp_head_to_head_break: {
    label: "RP head-to-head break",
    description:
      "Relative placement resolves via head-to-head; verify placements in the RP grid.",
  },
  rp_cycle_cj_break: {
    label: "RP cycle (CJ break)",
    description:
      "Panel ordinals form a 3-way cycle; CJ ordinals auto-filled to break the tie. Verify RP grid and placements.",
  },
  rp_clean: {
    label: "Clean relative placement",
    description:
      "Tabulate should succeed with consensus ordinals and no tie resolution UI.",
  },
  jnj_scope_smoke: {
    label: "JnJ finals panel smoke",
    description:
      "Validates scoped panel size (drops_finals excluded). Varied panel ordinals near consensus — verify RP grid and tabulate.",
  },
};

export function lookupPlaybookEntry(
  compType: CompType,
  roundType: RoundType,
  judgedRole: DanceRole | null
): PlaybookEntry | null {
  const byRound = PLAYBOOK[compType]?.[roundType];
  if (!byRound) return null;

  const edgeCase =
    judgedRole != null
      ? (byRound[judgedRole] ?? byRound.all)
      : byRound.all;
  if (!edgeCase) return null;

  const meta = EDGE_META[edgeCase];
  return { edgeCase, label: meta.label, description: meta.description };
}

export function isCallbackEdgeCase(edgeCase: EdgeCaseType): boolean {
  return (
    edgeCase === "advance_boundary_tie" ||
    edgeCase === "alternate_boundary_tie" ||
    edgeCase === "clean_callback"
  );
}

export function isOrdinalEdgeCase(edgeCase: EdgeCaseType): boolean {
  return (
    edgeCase === "rp_head_to_head_break" ||
    edgeCase === "rp_cycle_cj_break" ||
    edgeCase === "rp_clean" ||
    edgeCase === "jnj_scope_smoke"
  );
}
