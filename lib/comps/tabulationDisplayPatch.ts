import type { RoundTabulation } from "@/lib/comps/types";
import type { EntryDisplay } from "@/lib/comps/types";

export function patchTabulationEntries(
  tabulation: RoundTabulation,
  displaysByRoundEntryId: Map<string, EntryDisplay>
): RoundTabulation {
  if (tabulation.mode === "callback") {
    const entries = tabulation.entries.map((e) => {
      const d = displaysByRoundEntryId.get(e.roundEntryId);
      if (!d) return e;
      return { ...e, displayName: d.displayName, bibNumber: d.bibNumber };
    });
    const ranked = tabulation.ranked.map((r) => {
      const d = displaysByRoundEntryId.get(r.roundEntryId);
      if (!d) return r;
      return { ...r, displayName: d.displayName, bibNumber: d.bibNumber };
    });
    return { ...tabulation, entries, ranked };
  }

  const entries = tabulation.entries.map((e) => {
    const d = displaysByRoundEntryId.get(e.roundEntryId);
    if (!d) return e;
    return {
      ...e,
      displayName: d.displayName,
      bibNumber: d.bibNumber,
      leadDisplayName: d.leadDisplayName ?? null,
      followDisplayName: d.followDisplayName ?? null,
    };
  });
  return { ...tabulation, entries };
}
