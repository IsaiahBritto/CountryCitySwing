import { supabaseServer } from "@/lib/supabaseServer";
import { findOrCreateBibRecord } from "@/lib/comps/bibs";
import { personKeyFromFields } from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";
import type { EventRegistrantRole } from "@/lib/comps/eventRegistrants";
import {
  STRUCTURAL_EDIT_BLOCKED_MESSAGE,
  entryHasScores,
  type RegistrantEditTier,
} from "@/lib/comps/registrantEditPolicy";
import {
  type ResolvedRegistrant,
  SLOTS,
  slotPersonKey,
  normEmail,
} from "@/lib/comps/registrantResolve";

export interface RegistrantIdentityPatch {
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface RegistrantRolesPatch {
  jnj_lead?: boolean;
  jnj_follow?: boolean;
  strictly_lead?: boolean;
  strictly_follow?: boolean;
}

export interface ApplyRegistrantPatchInput {
  eventId: string;
  resolved: ResolvedRegistrant;
  identity: RegistrantIdentityPatch;
  roles?: RegistrantRolesPatch;
  strictlySwapLeadFollow?: boolean;
  tier: RegistrantEditTier;
}

export class RegistrantSyncError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = "RegistrantSyncError";
  }
}

function desiredRoleSet(roles?: RegistrantRolesPatch): Set<EventRegistrantRole> {
  const set = new Set<EventRegistrantRole>();
  if (roles?.jnj_lead) set.add("jnj_lead");
  if (roles?.jnj_follow) set.add("jnj_follow");
  if (roles?.strictly_lead) set.add("strictly_lead");
  if (roles?.strictly_follow) set.add("strictly_follow");
  return set;
}

function currentRoleSet(resolved: ResolvedRegistrant): Set<EventRegistrantRole> {
  return new Set(resolved.roles);
}

function slotUpdateFields(
  prefix: "jnj" | "strictly",
  side: "lead" | "follow",
  identity: RegistrantIdentityPatch,
  profileId: string | null
): Record<string, unknown> {
  const email =
    identity.email != null ? normEmail(identity.email) || null : null;
  return {
    [`${prefix}_${side}_first_name`]: identity.firstName.trim(),
    [`${prefix}_${side}_last_name`]: identity.lastName.trim(),
    [`${prefix}_${side}_email`]: email,
    [`${prefix}_${side}_profile_id`]: profileId,
  };
}

async function updateSignup(
  signupId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseServer
    .from("comp_signups")
    .update(patch)
    .eq("id", signupId);
  if (error) throw new RegistrantSyncError("Failed to update signup", 500);
}

async function clearSignupSlot(
  signupId: string,
  prefix: "jnj" | "strictly",
  side: "lead" | "follow"
): Promise<void> {
  await updateSignup(signupId, {
    [`${prefix}_${side}_first_name`]: null,
    [`${prefix}_${side}_last_name`]: null,
    [`${prefix}_${side}_email`]: null,
    [`${prefix}_${side}_profile_id`]: null,
  });
}

async function loadCompetitions(eventId: string) {
  const { data } = await supabaseServer
    .from("competitions")
    .select("id, comp_type")
    .eq("event_id", eventId);
  return data ?? [];
}

async function findEntryForSignupRole(
  competitionId: string,
  signupId: string,
  compType: string,
  role: EventRegistrantRole
): Promise<{ id: string } | null> {
  const { data } = await supabaseServer
    .from("comp_entries")
    .select("id, entry_kind, role")
    .eq("competition_id", competitionId)
    .eq("comp_signup_id", signupId);
  const rows = data ?? [];
  if (compType === "strictly") {
    return rows.find((e) => e.entry_kind === "couple") ?? null;
  }
  if (role === "jnj_lead") {
    return (
      rows.find((e) => e.entry_kind === "individual" && e.role === "lead") ??
      null
    );
  }
  return (
    rows.find((e) => e.entry_kind === "individual" && e.role === "follow") ??
    null
  );
}

async function deleteEntryIfAllowed(entryId: string): Promise<void> {
  if (await entryHasScores(entryId)) {
    throw new RegistrantSyncError(
      "Cannot remove division: entry already has scores",
      409
    );
  }
  const { error } = await supabaseServer
    .from("comp_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw new RegistrantSyncError("Failed to remove entry", 500);
}

async function syncIdentityToEntries(
  personKey: string,
  identity: RegistrantIdentityPatch,
  entryIds: string[]
): Promise<void> {
  if (entryIds.length === 0) return;

  const { data: entries } = await supabaseServer
    .from("comp_entries")
    .select("*")
    .in("id", entryIds);

  for (const entry of entries ?? []) {
    const update: Record<string, unknown> = {};
    const ekLead = personKeyFromFields(
      entry.lead_profile_id,
      entry.lead_email,
      entry.lead_first_name,
      entry.lead_last_name
    );
    const ekFollow = personKeyFromFields(
      entry.follow_profile_id,
      entry.follow_email,
      entry.follow_first_name,
      entry.follow_last_name
    );

    const email =
      identity.email != null ? normEmail(identity.email) || null : undefined;

    if (entry.entry_kind === "couple") {
      if (ekLead === personKey) {
        update.lead_first_name = identity.firstName.trim();
        update.lead_last_name = identity.lastName.trim();
        if (email !== undefined) update.lead_email = email;
      }
      if (ekFollow === personKey) {
        update.follow_first_name = identity.firstName.trim();
        update.follow_last_name = identity.lastName.trim();
        if (email !== undefined) update.follow_email = email;
      }
    } else if (entry.role === "follow" && ekFollow === personKey) {
      update.follow_first_name = identity.firstName.trim();
      update.follow_last_name = identity.lastName.trim();
      if (email !== undefined) update.follow_email = email;
    } else if (ekLead === personKey) {
      update.lead_first_name = identity.firstName.trim();
      update.lead_last_name = identity.lastName.trim();
      if (email !== undefined) update.lead_email = email;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabaseServer
        .from("comp_entries")
        .update(update)
        .eq("id", entry.id);
      if (error) throw new RegistrantSyncError("Failed to update entry", 500);
    }
  }
}

async function syncIdentityToSignups(
  resolved: ResolvedRegistrant,
  identity: RegistrantIdentityPatch
): Promise<void> {
  const profileId = resolved.profileId;
  for (const m of resolved.signupMatches) {
    const patch: Record<string, unknown> = {};
    for (const slot of SLOTS) {
      if (slotPersonKey(m.signup, slot) !== resolved.personKey) continue;
      Object.assign(
        patch,
        slotUpdateFields(slot.prefix, slot.side, identity, profileId)
      );
    }
    if (Object.keys(patch).length > 0) {
      await updateSignup(m.signupId, patch);
    }
  }
}

async function syncBibIdentity(
  eventId: string,
  bibId: string | null,
  identity: RegistrantIdentityPatch
): Promise<void> {
  if (!bibId) return;
  const email =
    identity.email != null ? normEmail(identity.email) || null : undefined;
  const update: Record<string, unknown> = {
    first_name: identity.firstName.trim(),
    last_name: identity.lastName.trim(),
  };
  if (email !== undefined) update.email = email;
  const { error } = await supabaseServer
    .from("comp_bibs")
    .update(update)
    .eq("id", bibId)
    .eq("event_id", eventId);
  if (error) throw new RegistrantSyncError("Failed to update bib record", 500);
}

async function swapStrictlyOnSignup(signup: CompSignupRow): Promise<CompSignupRow> {
  const patch = {
    strictly_lead_first_name: signup.strictly_follow_first_name,
    strictly_lead_last_name: signup.strictly_follow_last_name,
    strictly_lead_email: signup.strictly_follow_email,
    strictly_lead_profile_id: signup.strictly_follow_profile_id,
    strictly_follow_first_name: signup.strictly_lead_first_name,
    strictly_follow_last_name: signup.strictly_lead_last_name,
    strictly_follow_email: signup.strictly_lead_email,
    strictly_follow_profile_id: signup.strictly_lead_profile_id,
  };
  await updateSignup(signup.id, patch);
  return { ...signup, ...patch } as CompSignupRow;
}

async function swapStrictlyEntry(
  entryId: string,
  eventId: string
): Promise<void> {
  const { data: entry } = await supabaseServer
    .from("comp_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.entry_kind !== "couple") return;

  const newLeadBib = entry.follow_bib_id
    ? entry.follow_bib_id
    : await findOrCreateBibRecord(eventId, {
        firstName: entry.follow_first_name,
        lastName: entry.follow_last_name,
        email: entry.follow_email,
        profileId: entry.follow_profile_id,
      });

  const { error } = await supabaseServer
    .from("comp_entries")
    .update({
      lead_first_name: entry.follow_first_name,
      lead_last_name: entry.follow_last_name,
      lead_email: entry.follow_email,
      lead_profile_id: entry.follow_profile_id,
      follow_first_name: entry.lead_first_name,
      follow_last_name: entry.lead_last_name,
      follow_email: entry.lead_email,
      follow_profile_id: entry.lead_profile_id,
      lead_bib_id: newLeadBib,
      follow_bib_id: null,
    })
    .eq("id", entryId);
  if (error) throw new RegistrantSyncError("Failed to swap strictly entry", 500);
}

async function importEntryForSignup(
  competitionId: string,
  eventId: string,
  signup: CompSignupRow,
  compType: string,
  role: EventRegistrantRole
): Promise<void> {
  const prefix = compType === "jack_and_jill" ? "jnj" : "strictly";

  const leadFirst = String(
    signup[`${prefix}_lead_first_name` as keyof CompSignupRow] ?? ""
  );
  const leadLast = String(
    signup[`${prefix}_lead_last_name` as keyof CompSignupRow] ?? ""
  );
  const leadEmail =
    (signup[`${prefix}_lead_email` as keyof CompSignupRow] as string | null) ??
    null;
  const followFirst = String(
    signup[`${prefix}_follow_first_name` as keyof CompSignupRow] ?? ""
  );
  const followLast = String(
    signup[`${prefix}_follow_last_name` as keyof CompSignupRow] ?? ""
  );
  const followEmail =
    (signup[`${prefix}_follow_email` as keyof CompSignupRow] as string | null) ??
    null;
  const leadProfileId =
    (signup[`${prefix}_lead_profile_id` as keyof CompSignupRow] as
      | string
      | null) ?? null;
  const followProfileId =
    (signup[`${prefix}_follow_profile_id` as keyof CompSignupRow] as
      | string
      | null) ?? null;

  const existing = await findEntryForSignupRole(
    competitionId,
    signup.id,
    compType,
    role
  );
  if (existing) return;

  if (compType === "jack_and_jill") {
    if (role === "jnj_lead") {
      await supabaseServer.from("comp_entries").insert({
        competition_id: competitionId,
        entry_kind: "individual",
        role: "lead",
        lead_first_name: leadFirst,
        lead_last_name: leadLast,
        lead_email: leadEmail,
        lead_profile_id: leadProfileId,
        follow_first_name: "",
        follow_last_name: "",
        follow_email: null,
        follow_profile_id: null,
        lead_bib_id: await findOrCreateBibRecord(eventId, {
          firstName: leadFirst,
          lastName: leadLast,
          email: leadEmail,
          profileId: leadProfileId,
        }),
        follow_bib_id: null,
        comp_signup_id: signup.id,
      });
    } else if (role === "jnj_follow") {
      await supabaseServer.from("comp_entries").insert({
        competition_id: competitionId,
        entry_kind: "individual",
        role: "follow",
        lead_first_name: "",
        lead_last_name: "",
        lead_email: null,
        lead_profile_id: null,
        follow_first_name: followFirst,
        follow_last_name: followLast,
        follow_email: followEmail,
        follow_profile_id: followProfileId,
        lead_bib_id: null,
        follow_bib_id: await findOrCreateBibRecord(eventId, {
          firstName: followFirst,
          lastName: followLast,
          email: followEmail,
          profileId: followProfileId,
        }),
        comp_signup_id: signup.id,
      });
    }
  } else if (role === "strictly_lead" || role === "strictly_follow") {
    await supabaseServer.from("comp_entries").insert({
      competition_id: competitionId,
      entry_kind: "couple",
      lead_first_name: leadFirst,
      lead_last_name: leadLast,
      lead_email: leadEmail,
      lead_profile_id: leadProfileId,
      follow_first_name: followFirst,
      follow_last_name: followLast,
      follow_email: followEmail,
      follow_profile_id: followProfileId,
      lead_bib_id: await findOrCreateBibRecord(eventId, {
        firstName: leadFirst,
        lastName: leadLast,
        email: leadEmail,
        profileId: leadProfileId,
      }),
      follow_bib_id: null,
      comp_signup_id: signup.id,
    });
  }
}

function rolesChanged(
  roles: RegistrantRolesPatch | undefined,
  resolved: ResolvedRegistrant
): boolean {
  if (!roles) return false;
  const d = desiredRoleSet(roles);
  const c = currentRoleSet(resolved);
  if (d.size !== c.size) return true;
  for (const r of d) if (!c.has(r)) return true;
  for (const r of c) if (!d.has(r)) return true;
  return false;
}

async function applyStructuralChanges(
  input: ApplyRegistrantPatchInput,
  warnings: string[]
): Promise<void> {
  const { resolved, roles, strictlySwapLeadFollow, eventId, identity } = input;

  if (strictlySwapLeadFollow) {
    for (const m of resolved.signupMatches) {
      if (!m.signup.strictly_selected) continue;
      const updated = await swapStrictlyOnSignup(m.signup);
      const comps = await loadCompetitions(eventId);
      for (const c of comps) {
        if (c.comp_type !== "strictly") continue;
        const ent = await findEntryForSignupRole(
          c.id,
          m.signupId,
          "strictly",
          "strictly_lead"
        );
        if (ent) await swapStrictlyEntry(ent.id, eventId);
      }
      m.signup = updated;
    }
  }

  if (!roles || !rolesChanged(roles, resolved)) return;

  const desired = desiredRoleSet(roles);
  const current = currentRoleSet(resolved);
  const comps = await loadCompetitions(eventId);

  const primarySignup = resolved.signupMatches[0];
  if (!primarySignup && desired.size > current.size) {
    warnings.push("No signup linked; division adds require a registration row.");
    return;
  }

  for (const role of current) {
    if (desired.has(role)) continue;
    for (const m of resolved.signupMatches) {
      if (!m.roles.includes(role)) continue;
      const slot = SLOTS.find((s) => s.role === role)!;
      await clearSignupSlot(m.signupId, slot.prefix, slot.side);
      if (slot.prefix === "jnj") {
        const s = m.signup;
        const stillLead = s.jnj_lead_first_name || s.jnj_lead_profile_id;
        const stillFollow = s.jnj_follow_first_name || s.jnj_follow_profile_id;
        if (!stillLead && !stillFollow) {
          await updateSignup(m.signupId, { jnj_selected: false });
        }
      }
      if (slot.prefix === "strictly") {
        await updateSignup(m.signupId, { strictly_selected: false });
      }
    }
    for (const c of comps) {
      const compType = c.comp_type;
      if (
        (role.startsWith("jnj") && compType !== "jack_and_jill") ||
        (role.startsWith("strictly") && compType !== "strictly")
      )
        continue;
      for (const m of resolved.signupMatches) {
        const ent = await findEntryForSignupRole(
          c.id,
          m.signupId,
          compType,
          role
        );
        if (ent) await deleteEntryIfAllowed(ent.id);
      }
    }
  }

  for (const role of desired) {
    if (current.has(role)) continue;
    if (!primarySignup) continue;
    const slot = SLOTS.find((s) => s.role === role)!;
    await updateSignup(primarySignup.signupId, {
      [slot.selectedKey]: true,
      ...slotUpdateFields(
        slot.prefix,
        slot.side,
        identity,
        resolved.profileId
      ),
    });
    const { data: freshSignup } = await supabaseServer
      .from("comp_signups")
      .select("*")
      .eq("id", primarySignup.signupId)
      .single();
    if (!freshSignup) continue;
    for (const c of comps) {
      if (
        (role.startsWith("jnj") && c.comp_type !== "jack_and_jill") ||
        (role.startsWith("strictly") && c.comp_type !== "strictly")
      )
        continue;
      await importEntryForSignup(
        c.id,
        eventId,
        freshSignup as CompSignupRow,
        c.comp_type,
        role
      );
    }
  }
}

export async function applyRegistrantPatch(
  input: ApplyRegistrantPatchInput
): Promise<{ warnings: string[]; competitionIds: string[] }> {
  const warnings: string[] = [];
  const { resolved, identity, tier, roles, strictlySwapLeadFollow } = input;

  if (!resolved.signupManaged && resolved.entryIds.length > 0) {
    warnings.push(
      "This person is not linked to a signup; only competition entries were updated where matched."
    );
  }

  const structuralRequested =
    !!strictlySwapLeadFollow || rolesChanged(roles, resolved);

  if (structuralRequested && tier === "limited") {
    throw new RegistrantSyncError(STRUCTURAL_EDIT_BLOCKED_MESSAGE, 409);
  }

  await syncIdentityToSignups(resolved, identity);
  await syncIdentityToEntries(resolved.personKey, identity, resolved.entryIds);
  await syncBibIdentity(input.eventId, resolved.bibId, identity);

  if (tier === "full") {
    await applyStructuralChanges(input, warnings);
  }

  const comps = await loadCompetitions(input.eventId);
  return {
    warnings,
    competitionIds: comps.map((c) => c.id),
  };
}

export async function syncEntryIdentityOnly(
  entryId: string,
  patch: Record<string, unknown>
): Promise<string> {
  const { data: entry } = await supabaseServer
    .from("comp_entries")
    .select("competition_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) throw new RegistrantSyncError("Entry not found", 404);

  const { error } = await supabaseServer
    .from("comp_entries")
    .update(patch)
    .eq("id", entryId);
  if (error) throw new RegistrantSyncError("Failed to update entry", 500);
  return entry.competition_id;
}
