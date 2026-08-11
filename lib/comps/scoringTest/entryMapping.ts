import type { CompEntryRow, DanceRole, EntryKind } from "@/lib/comps/types";
import type { EntrySlot, ScenarioSlot, SlotMap } from "./types";
import { slotAtIndex } from "./types";

export interface MappedEntry {
  entryId: string;
  slot: ScenarioSlot;
  bibNumber: number | null;
}

type EntryWithBib = CompEntryRow & {
  lead_bib?: { bib_number: number | null } | null;
  follow_bib?: { bib_number: number | null } | null;
};

function bibForEntry(entry: EntryWithBib): number | null {
  if (entry.entry_kind === "couple") {
    return entry.lead_bib?.bib_number ?? null;
  }
  if (entry.role === "follow") {
    return entry.follow_bib?.bib_number ?? null;
  }
  return entry.lead_bib?.bib_number ?? null;
}

/** Map existing comp entries to scenario slots (sorted by bib). */
export function mapEntriesToSlots(
  entries: EntryWithBib[],
  options: {
    entryKind: EntryKind;
    role?: DanceRole | null;
    minCount: number;
    label: string;
  }
): SlotMap {
  const filtered = entries
    .filter((e) => e.entry_kind === options.entryKind)
    .filter((e) =>
      options.role == null ? true : e.role === options.role
    )
    .sort((a, b) => {
      const aBib = bibForEntry(a) ?? 9999;
      const bBib = bibForEntry(b) ?? 9999;
      return aBib - bBib;
    });

  if (filtered.length < options.minCount) {
    throw new Error(
      `${options.label} needs at least ${options.minCount} entries (has ${filtered.length})`
    );
  }

  const bySlot = new Map<EntrySlot, string>();
  const slots: EntrySlot[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const slot = slotAtIndex(i);
    bySlot.set(slot, filtered[i].id);
    slots.push(slot);
  }
  return { bySlot, slots };
}

type RoundEntryWithBib = {
  id: string;
  entry_id: string;
  scratched?: boolean;
  entry: EntryWithBib;
};

/** Map active round entries to bib-ordered slots (all entries, not capped). */
export function mapRoundEntriesToSlots(
  roundEntries: RoundEntryWithBib[],
  options?: { includeScratched?: boolean }
): SlotMap {
  const active = roundEntries.filter(
    (re) => options?.includeScratched || !re.scratched
  );
  const sorted = [...active].sort((a, b) => {
    const aBib = bibForEntry(a.entry) ?? 9999;
    const bBib = bibForEntry(b.entry) ?? 9999;
    return aBib - bBib;
  });

  const bySlot = new Map<EntrySlot, string>();
  const slots: EntrySlot[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const slot = slotAtIndex(i);
    bySlot.set(slot, sorted[i].entry_id);
    slots.push(slot);
  }
  return { bySlot, slots };
}

export function slotMapFromMapped(mapped: MappedEntry[]): SlotMap {
  const bySlot = new Map<ScenarioSlot, string>();
  const slots: ScenarioSlot[] = [];
  for (const m of mapped) {
    bySlot.set(m.slot, m.entryId);
    slots.push(m.slot);
  }
  return { bySlot, slots };
}

export function roundEntrySlotMap(
  roundEntries: { id: string; entry_id: string }[],
  entrySlots: SlotMap
): Map<EntrySlot, string> {
  const entryToSlot = new Map<string, EntrySlot>();
  for (const [slot, entryId] of entrySlots.bySlot) {
    entryToSlot.set(entryId, slot);
  }
  const bySlot = new Map<EntrySlot, string>();
  for (const re of roundEntries) {
    const slot = entryToSlot.get(re.entry_id);
    if (slot) bySlot.set(slot, re.id);
  }
  return bySlot;
}

export function slotsToRoundEntryIds(
  order: EntrySlot[],
  roundBySlot: Map<EntrySlot, string>
): string[] {
  return order.map((s) => {
    const id = roundBySlot.get(s);
    if (!id) throw new Error(`Missing round entry for slot ${s}`);
    return id;
  });
}
