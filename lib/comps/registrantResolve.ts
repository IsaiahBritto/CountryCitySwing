import { supabaseServer } from "@/lib/supabaseServer";
import type { CompSignupRow } from "@/lib/comps/types";
import {
  personKeyFromFields,
  type EventRegistrantPerson,
  type EventRegistrantRole,
} from "@/lib/comps/eventRegistrants";
import {
  editTierForCompetition,
  editTierForEntries,
  type RegistrantEditTier,
} from "@/lib/comps/registrantEditPolicy";

const normEmail = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

export interface SignupSlotMatch {
  signupId: string;
  signup: CompSignupRow;
  roles: EventRegistrantRole[];
}

export interface ResolvedRegistrant {
  personKey: string;
  firstName: string;
  lastName: string;
  email: string | null;
  profileId: string | null;
  bibId: string | null;
  roles: EventRegistrantRole[];
  signupMatches: SignupSlotMatch[];
  entryIds: string[];
  /** No signup row — walk-up or reused entry only. */
  signupManaged: boolean;
  tiersByCompetition: { competitionId: string; name: string; tier: RegistrantEditTier }[];
  overallTier: RegistrantEditTier;
}

type SlotDef = {
  role: EventRegistrantRole;
  prefix: "jnj" | "strictly";
  side: "lead" | "follow";
  selectedKey: keyof CompSignupRow;
};

const SLOTS: SlotDef[] = [
  {
    role: "jnj_lead",
    prefix: "jnj",
    side: "lead",
    selectedKey: "jnj_selected",
  },
  {
    role: "jnj_follow",
    prefix: "jnj",
    side: "follow",
    selectedKey: "jnj_selected",
  },
  {
    role: "strictly_lead",
    prefix: "strictly",
    side: "lead",
    selectedKey: "strictly_selected",
  },
  {
    role: "strictly_follow",
    prefix: "strictly",
    side: "follow",
    selectedKey: "strictly_selected",
  },
];

function slotPersonKey(
  signup: CompSignupRow,
  slot: SlotDef
): string | null {
  if (!signup[slot.selectedKey]) return null;
  const p = slot.prefix;
  const s = slot.side;
  const first =
    (signup[`${p}_${s}_first_name` as keyof CompSignupRow] as string) ?? "";
  const last =
    (signup[`${p}_${s}_last_name` as keyof CompSignupRow] as string) ?? "";
  const email =
    (signup[`${p}_${s}_email` as keyof CompSignupRow] as string | null) ?? null;
  const profileId =
    (signup[`${p}_${s}_profile_id` as keyof CompSignupRow] as string | null) ??
    null;
  if (!first && !last && !email && !profileId) return null;
  return personKeyFromFields(profileId, email, first, last);
}

function entryPersonKeys(entry: {
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string | null;
  lead_profile_id: string | null;
  follow_first_name: string;
  follow_last_name: string;
  follow_email: string | null;
  follow_profile_id: string | null;
  entry_kind: string;
  role: string | null;
}): string[] {
  const keys: string[] = [];
  const leadKey = personKeyFromFields(
    entry.lead_profile_id,
    entry.lead_email,
    entry.lead_first_name,
    entry.lead_last_name
  );
  const followKey = personKeyFromFields(
    entry.follow_profile_id,
    entry.follow_email,
    entry.follow_first_name,
    entry.follow_last_name
  );
  if (entry.entry_kind === "couple") {
    if (entry.lead_first_name || entry.lead_last_name || entry.lead_email)
      keys.push(leadKey);
    if (
      entry.follow_first_name ||
      entry.follow_last_name ||
      entry.follow_email
    )
      keys.push(followKey);
  } else if (entry.role === "follow") {
    keys.push(followKey);
  } else {
    keys.push(leadKey);
  }
  return keys;
}

/** Load signups + entries for an event and resolve a roster personKey. */
export async function resolveRegistrant(
  eventId: string,
  personKey: string,
  rosterPerson?: EventRegistrantPerson
): Promise<ResolvedRegistrant | null> {
  const [signupsRes, compsRes] = await Promise.all([
    supabaseServer.from("comp_signups").select("*").eq("event_id", eventId),
    supabaseServer
      .from("competitions")
      .select("id, name")
      .eq("event_id", eventId),
  ]);

  const signups = (signupsRes.data ?? []) as CompSignupRow[];
  const competitions = compsRes.data ?? [];
  const compIds = competitions.map((c) => c.id);

  let entryRows: {
    id: string;
    competition_id: string;
    entry_kind: string;
    role: string | null;
    lead_first_name: string;
    lead_last_name: string;
    lead_email: string | null;
    lead_profile_id: string | null;
    follow_first_name: string;
    follow_last_name: string;
    follow_email: string | null;
    follow_profile_id: string | null;
    comp_signup_id: string | null;
  }[] = [];

  if (compIds.length > 0) {
    const { data } = await supabaseServer
      .from("comp_entries")
      .select(
        "id, competition_id, entry_kind, role, lead_first_name, lead_last_name, lead_email, lead_profile_id, follow_first_name, follow_last_name, follow_email, follow_profile_id, comp_signup_id"
      )
      .in("competition_id", compIds);
    entryRows = data ?? [];
  }

  const signupMatches: SignupSlotMatch[] = [];
  const rolesSet = new Set<EventRegistrantRole>();

  for (const signup of signups) {
    const roles: EventRegistrantRole[] = [];
    for (const slot of SLOTS) {
      const key = slotPersonKey(signup, slot);
      if (key === personKey) {
        roles.push(slot.role);
        rolesSet.add(slot.role);
      }
    }
    if (roles.length > 0) {
      signupMatches.push({ signupId: signup.id, signup, roles });
    }
  }

  const entryIds = entryRows
    .filter((e) => entryPersonKeys(e).includes(personKey))
    .map((e) => e.id);

  if (
    !rosterPerson &&
    signupMatches.length === 0 &&
    entryIds.length === 0
  ) {
    return null;
  }

  const roles =
    rosterPerson?.roles.length
      ? rosterPerson.roles
      : ([...rolesSet].sort() as EventRegistrantRole[]);

  const firstName = rosterPerson?.firstName ?? "";
  const lastName = rosterPerson?.lastName ?? "";
  const email = rosterPerson?.email ?? null;
  const profileId = rosterPerson?.profileId ?? null;
  const bibId = rosterPerson?.bibId ?? null;

  const tiersByCompetition: ResolvedRegistrant["tiersByCompetition"] = [];
  for (const comp of competitions) {
    const linked = entryRows
      .filter(
        (e) =>
          e.competition_id === comp.id && entryIds.includes(e.id)
      )
      .map((e) => e.id);
    const tier = await editTierForCompetition(comp.id, linked);
    tiersByCompetition.push({
      competitionId: comp.id,
      name: comp.name,
      tier,
    });
  }

  const overallTier = await editTierForEntries(entryIds);

  return {
    personKey,
    firstName: rosterPerson?.firstName ?? firstName,
    lastName: rosterPerson?.lastName ?? lastName,
    email: rosterPerson?.email ?? email,
    profileId: rosterPerson?.profileId ?? profileId,
    bibId,
    roles,
    signupMatches,
    entryIds,
    signupManaged: signupMatches.length > 0,
    tiersByCompetition,
    overallTier,
  };
}

/** Strictly partner display name for confirm dialog. */
export function strictlyPartnerName(
  resolved: ResolvedRegistrant,
  personKey: string
): string | null {
  for (const m of resolved.signupMatches) {
    const s = m.signup;
    if (!s.strictly_selected) continue;
    const leadKey = slotPersonKey(s, SLOTS[2]);
    const followKey = slotPersonKey(s, SLOTS[3]);
    if (personKey === leadKey && followKey) {
      return `${s.strictly_follow_first_name ?? ""} ${s.strictly_follow_last_name ?? ""}`.trim();
    }
    if (personKey === followKey && leadKey) {
      return `${s.strictly_lead_first_name ?? ""} ${s.strictly_lead_last_name ?? ""}`.trim();
    }
  }
  return null;
}

export { SLOTS, slotPersonKey, normEmail };
