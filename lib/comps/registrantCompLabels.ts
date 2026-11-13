import {
  formatRegistrantCompLabels,
  personKeyFromFields,
  type EventRegistrantPerson,
  type EventRegistrantRole,
} from "@/lib/comps/eventRegistrants";
import { COMP_TYPE_LABEL } from "@/lib/comps/hubTypes";
import type { CompType } from "@/lib/comps/types";
import { entryPersonKeys, type EntryPersonFields } from "@/lib/comps/entryPersonKeys";

export type { EntryPersonFields };
export { entryPersonKeys };

export interface EventEntryRow extends EntryPersonFields {
  id: string;
  competition_id: string;
  comp_signup_id?: string | null;
  source_lead_entry_id?: string | null;
}

export interface CompetitionMeta {
  id: string;
  name: string;
  comp_type: CompType | string;
}

/** @deprecated Event-level levels; bib labels use competition.name instead. */
export interface EventLevelMeta {
  jnj_level?: string | null;
  strictly_level?: string | null;
}

type RoleSide = "Lead" | "Follow" | "Partner";

function compTypeDisplay(compType: string): string {
  return COMP_TYPE_LABEL[compType] ?? compType.replace(/_/g, " ");
}

function formatRoleList(sides: Iterable<RoleSide>): string {
  return [...new Set(sides)]
    .sort((a, b) => {
      const order = { Lead: 0, Follow: 1, Partner: 2 };
      return order[a] - order[b];
    })
    .join(", ");
}

/** `{competition name} {comp type} (Lead|Follow|…)` */
export function formatCompetitionRoleLabel(
  comp: CompetitionMeta,
  sides: Iterable<RoleSide>
): string {
  const name = (comp.name ?? "").trim() || "Division";
  const typeName = compTypeDisplay(comp.comp_type);
  return `${name} ${typeName} (${formatRoleList(sides)})`;
}

function sortCompetitions(competitions: CompetitionMeta[]): CompetitionMeta[] {
  return [...competitions].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
  );
}

function sortedUniqueLabels(labels: string[]): string[] {
  return [...new Set(labels)].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function roleSidesForType(
  roles: EventRegistrantRole[],
  prefix: "jnj" | "strictly"
): Set<RoleSide> {
  const sides = new Set<RoleSide>();
  for (const role of roles) {
    if (prefix === "jnj" && role === "jnj_lead") sides.add("Lead");
    if (prefix === "jnj" && role === "jnj_follow") sides.add("Follow");
    if (prefix === "strictly" && role === "strictly_lead") sides.add("Lead");
    if (prefix === "strictly" && role === "strictly_follow") sides.add("Follow");
  }
  return sides;
}

/** Pre-import signup roster: named division when stored on signup, else generic type + role. */
export function formatSignupCompetingIn(
  person: Pick<EventRegistrantPerson, "roles" | "signupDivisionIds">,
  competitions: CompetitionMeta[]
): string[] {
  const roles = person.roles;
  if (roles.length === 0) return ["Walk-up"];

  const byId = new Map(competitions.map((c) => [c.id, c]));
  const labels: string[] = [];
  const div = person.signupDivisionIds;

  if (div?.jnjCompetitionId) {
    const comp = byId.get(div.jnjCompetitionId);
    const sides = roleSidesForType(roles, "jnj");
    if (comp && sides.size > 0) {
      labels.push(formatCompetitionRoleLabel(comp, sides));
    }
  }
  if (div?.allAmericanCompetitionId) {
    const comp = byId.get(div.allAmericanCompetitionId);
    const sides = roleSidesForType(roles, "jnj");
    if (comp && sides.size > 0) {
      labels.push(formatCompetitionRoleLabel(comp, sides));
    }
  }
  if (div?.strictlyCompetitionId) {
    const comp = byId.get(div.strictlyCompetitionId);
    const sides = roleSidesForType(roles, "strictly");
    if (comp && sides.size > 0) {
      labels.push(formatCompetitionRoleLabel(comp, sides));
    }
  }

  if (labels.length > 0) {
    return sortedUniqueLabels(labels);
  }

  return formatRegistrantCompLabels(roles);
}

function roleSideForEntry(
  entry: EventEntryRow,
  personKey: string
): RoleSide | null {
  if (!entryPersonKeys(entry).includes(personKey)) return null;

  if (entry.entry_kind === "couple") {
    const leadKey = personKeyFromFields(
      entry.lead_profile_id,
      entry.lead_email,
      entry.lead_first_name,
      entry.lead_last_name
    );
    if (personKey === leadKey) return "Lead";
    return "Follow";
  }

  if (entry.role === "follow") return "Follow";
  return "Lead";
}

/** One label per competition (name + type + role), deduped per division. */
export function buildCompetingInFromEntries(
  personKey: string,
  entries: EventEntryRow[],
  competitions: CompetitionMeta[]
): string[] {
  const sidesByCompId = new Map<string, Set<RoleSide>>();

  for (const entry of entries) {
    if (entry.source_lead_entry_id) continue;
    const side = roleSideForEntry(entry, personKey);
    if (!side) continue;
    const set = sidesByCompId.get(entry.competition_id) ?? new Set<RoleSide>();
    set.add(side);
    sidesByCompId.set(entry.competition_id, set);
  }

  const labels: string[] = [];
  for (const comp of sortCompetitions(competitions)) {
    const sides = sidesByCompId.get(comp.id);
    if (!sides || sides.size === 0) continue;
    labels.push(formatCompetitionRoleLabel(comp, sides));
  }

  return sortedUniqueLabels(labels);
}

/** Attach competingIn from comp_entries, else signup + on-event competition names. */
export function enrichRosterCompetingIn(
  roster: EventRegistrantPerson[],
  entries: EventEntryRow[],
  competitions: CompetitionMeta[],
  _levels: EventLevelMeta = {}
): EventRegistrantPerson[] {
  return roster.map((person) => {
    const fromEntries = buildCompetingInFromEntries(
      person.personKey,
      entries,
      competitions
    );

    let competingIn: string[];
    if (fromEntries.length > 0) {
      competingIn = fromEntries;
    } else if (person.roles.length > 0) {
      competingIn = formatSignupCompetingIn(person, competitions);
    } else {
      competingIn = ["Walk-up"];
    }

    return { ...person, competingIn };
  });
}
