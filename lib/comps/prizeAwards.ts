/**
 * Competition prize awards: seeding, persistence, and send eligibility.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { listFinalsPlacements } from "@/lib/comps/finalsPlacements";
import {
  computeNextFinisher,
  computeNextPlacement,
  itemsForRecipient,
  recipientCanSend,
  recipientSendStatus,
  type PrizeItemRow,
  type PrizeRecipientRow,
} from "@/lib/comps/prizeAwardsLogic";

export {
  computeNextFinisher,
  computeNextPlacement,
  itemsForRecipient,
  recipientCanSend,
  recipientSendStatus,
  type PrizeItemRow,
  type PrizeRecipientRow,
} from "@/lib/comps/prizeAwardsLogic";

export interface PrizeGroupRow {
  id: string;
  competition_id: string;
  placement: number;
  round_entry_id: string;
  entry_id: string;
  shared_prizes: boolean;
}

export class PrizeAwardsError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = "PrizeAwardsError";
  }
}

type EntryWithBibs = {
  id: string;
  entry_kind: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string | null;
  follow_first_name: string;
  follow_last_name: string;
  follow_email: string | null;
  lead_profile_id: string | null;
  follow_profile_id: string | null;
  lead_bib: { bib_number: number; email: string | null } | null;
  follow_bib: { bib_number: number; email: string | null } | null;
};

export interface PrizeItemPayload {
  id?: string;
  description: string;
  redemptionCode?: string | null;
  sortOrder: number;
}

export interface PrizeRecipientPayload {
  id: string;
  email?: string;
  items?: PrizeItemPayload[];
}

export interface PrizeGroupPatchPayload {
  id: string;
  sharedPrizes?: boolean;
  recipients?: PrizeRecipientPayload[];
}

export interface PrizeRecipientView {
  id: string;
  role: "lead" | "follow";
  firstName: string;
  lastName: string;
  email: string | null;
  emailSentAt: string | null;
  prizesUpdatedAt: string;
  canSend: boolean;
  sendStatus: "ready" | "sent" | "needs_prizes" | "no_email";
  items: {
    id: string;
    description: string;
    redemptionCode: string | null;
    sortOrder: number;
  }[];
}

export interface PrizeGroupView {
  id: string;
  placement: number;
  sharedPrizes: boolean;
  displayName: string;
  bibNumber: number | null;
  recipients: PrizeRecipientView[];
}

const ENTRY_SELECT =
  "id, entry_kind, lead_first_name, lead_last_name, lead_email, follow_first_name, follow_last_name, follow_email, lead_profile_id, follow_profile_id, lead_bib:comp_bibs!comp_entries_lead_bib_id_fkey(bib_number, email), follow_bib:comp_bibs!comp_entries_follow_bib_id_fkey(bib_number, email)";

/** Finals couple round that is tabulated or published; null when not ready. */
export async function findFinalsRound(competitionId: string) {
  const { data, error } = await supabaseServer
    .from("comp_rounds")
    .select("id, tabulation, status, round_type, judged_role")
    .eq("competition_id", competitionId)
    .eq("round_type", "final")
    .is("judged_role", null)
    .in("status", ["tabulated", "published"])
    .maybeSingle();

  if (error) {
    throw new PrizeAwardsError("Failed to load finals round", 500);
  }
  return data;
}

/** Requires tabulated/published finals; throws 409 when not ready. */
export async function resolveFinalsRound(competitionId: string) {
  const data = await findFinalsRound(competitionId);
  if (!data) {
    throw new PrizeAwardsError(
      "Finals must be tabulated before prize awards are available",
      409
    );
  }
  return data;
}

/** Remove all prize groups (and recipients/items via cascade) for a competition. */
export async function clearPrizeAwardsForCompetition(competitionId: string) {
  const { error } = await supabaseServer
    .from("comp_prize_groups")
    .delete()
    .eq("competition_id", competitionId);
  if (error) {
    throw new PrizeAwardsError("Failed to clear prize awards", 500);
  }
}

/** True when this round is the couple finals round for prize sync. */
export function isCoupleFinalsRound(round: {
  round_type: string;
  judged_role: string | null;
}): boolean {
  return round.round_type === "final" && round.judged_role == null;
}

function resolveLeadEmail(entry: EntryWithBibs): string | null {
  return (
    entry.lead_email?.trim() ||
    entry.lead_bib?.email?.trim() ||
    null
  );
}

function resolveFollowEmail(entry: EntryWithBibs): string | null {
  return (
    entry.follow_email?.trim() ||
    entry.follow_bib?.email?.trim() ||
    null
  );
}

async function loadRoundEntryWithEntry(roundEntryId: string) {
  const { data, error } = await supabaseServer
    .from("comp_round_entries")
    .select(`id, entry_id, entry:comp_entries(${ENTRY_SELECT})`)
    .eq("id", roundEntryId)
    .maybeSingle();

  if (error || !data?.entry) {
    throw new PrizeAwardsError("Finals entry not found for placement", 404);
  }
  return {
    roundEntryId: data.id as string,
    entryId: data.entry_id as string,
    entry: data.entry as unknown as EntryWithBibs,
  };
}

async function insertEmptyItems(recipientId: string) {
  const { error } = await supabaseServer.from("comp_prize_items").insert({
    recipient_id: recipientId,
    description: "",
    redemption_code: null,
    sort_order: 0,
  });
  if (error) {
    throw new PrizeAwardsError("Failed to create prize row", 500);
  }
}

export async function seedPrizeGroupForPlacement(
  competitionId: string,
  placement: number,
  roundEntryId: string,
  sharedPrizes = true
): Promise<string> {
  const { entryId, entry } = await loadRoundEntryWithEntry(roundEntryId);

  const { data: group, error: groupError } = await supabaseServer
    .from("comp_prize_groups")
    .insert({
      competition_id: competitionId,
      placement,
      round_entry_id: roundEntryId,
      entry_id: entryId,
      shared_prizes: sharedPrizes,
    })
    .select("id")
    .single();

  if (groupError || !group) {
    console.error("[prizeAwards] create group failed", groupError);
    const detail = groupError?.message ?? "";
    if (groupError?.code === "23505") {
      throw new PrizeAwardsError(
        "A prize group already exists for this finisher",
        409
      );
    }
    throw new PrizeAwardsError(
      detail ? `Failed to create prize group: ${detail}` : "Failed to create prize group",
      500
    );
  }

  const now = new Date().toISOString();
  const recipients = [
    {
      group_id: group.id,
      role: "lead" as const,
      first_name: entry.lead_first_name,
      last_name: entry.lead_last_name,
      email: resolveLeadEmail(entry),
      profile_id: entry.lead_profile_id,
      prizes_updated_at: now,
    },
    {
      group_id: group.id,
      role: "follow" as const,
      first_name: entry.follow_first_name,
      last_name: entry.follow_last_name,
      email: resolveFollowEmail(entry),
      profile_id: entry.follow_profile_id,
      prizes_updated_at: now,
    },
  ];

  const { data: insertedRecipients, error: recipientError } = await supabaseServer
    .from("comp_prize_recipients")
    .insert(recipients)
    .select("id, role");

  if (recipientError || !insertedRecipients?.length) {
    console.error("[prizeAwards] create recipients failed", recipientError);
    await supabaseServer.from("comp_prize_groups").delete().eq("id", group.id);
    const detail = recipientError?.message ?? "";
    throw new PrizeAwardsError(
      detail
        ? `Failed to create prize recipients: ${detail}`
        : "Failed to create prize recipients",
      500
    );
  }

  const leadRecipient = insertedRecipients.find((r) => r.role === "lead");
  if (leadRecipient) {
    await insertEmptyItems(leadRecipient.id);
  }
  if (!sharedPrizes) {
    const followRecipient = insertedRecipients.find((r) => r.role === "follow");
    if (followRecipient) {
      await insertEmptyItems(followRecipient.id);
    }
  }

  return group.id;
}

export async function ensureTopThreeSeeded(competitionId: string) {
  const finals = await resolveFinalsRound(competitionId);
  const placements = listFinalsPlacements(finals.tabulation);

  const { data: existing } = await supabaseServer
    .from("comp_prize_groups")
    .select("round_entry_id")
    .eq("competition_id", competitionId);

  const existingRoundEntries = new Set(
    (existing ?? []).map((g) => g.round_entry_id as string)
  );

  for (const p of placements.filter((row) => row.placement <= 3)) {
    if (existingRoundEntries.has(p.roundEntryId)) continue;
    await seedPrizeGroupForPlacement(
      competitionId,
      p.placement,
      p.roundEntryId
    );
    existingRoundEntries.add(p.roundEntryId);
  }
}

async function fetchItemsByRecipient(
  recipientIds: string[]
): Promise<Map<string, PrizeItemRow[]>> {
  const map = new Map<string, PrizeItemRow[]>();
  if (recipientIds.length === 0) return map;

  const { data, error } = await supabaseServer
    .from("comp_prize_items")
    .select("*")
    .in("recipient_id", recipientIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new PrizeAwardsError("Failed to load prize items", 500);
  }

  for (const item of (data ?? []) as PrizeItemRow[]) {
    const list = map.get(item.recipient_id) ?? [];
    list.push(item);
    map.set(item.recipient_id, list);
  }
  return map;
}

function placementMeta(
  roundEntryId: string,
  tabulation: unknown
): { displayName: string; bibNumber: number | null } {
  const placements = listFinalsPlacements(tabulation);
  const row = placements.find((p) => p.roundEntryId === roundEntryId);
  return {
    displayName: row?.displayName ?? "Unknown",
    bibNumber: row?.bibNumber ?? null,
  };
}

export async function buildPrizesPayload(competitionId: string) {
  const { data: competition, error: compError } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type")
    .eq("id", competitionId)
    .maybeSingle();

  if (compError || !competition) {
    throw new PrizeAwardsError("Competition not found", 404);
  }

  let finals;
  try {
    finals = await resolveFinalsRound(competitionId);
  } catch (err) {
    if (err instanceof PrizeAwardsError && err.status === 409) {
      await clearPrizeAwardsForCompetition(competitionId);
      return {
        finalsReady: false,
        competition,
        nextPlacement: null,
        groups: [] as PrizeGroupView[],
      };
    }
    throw err;
  }

  await ensureTopThreeSeeded(competitionId);

  const allPlacements = listFinalsPlacements(finals.tabulation);

  const { data: groups, error: groupsError } = await supabaseServer
    .from("comp_prize_groups")
    .select("*")
    .eq("competition_id", competitionId)
    .order("placement", { ascending: true });

  if (groupsError) {
    throw new PrizeAwardsError("Failed to load prize groups", 500);
  }

  const groupRows = (groups ?? []) as PrizeGroupRow[];
  const groupIds = groupRows.map((g) => g.id);

  let recipients: PrizeRecipientRow[] = [];
  if (groupIds.length > 0) {
    const { data: recipientData, error: recipientError } = await supabaseServer
      .from("comp_prize_recipients")
      .select("*")
      .in("group_id", groupIds)
      .order("role", { ascending: true });

    if (recipientError) {
      throw new PrizeAwardsError("Failed to load prize recipients", 500);
    }
    recipients = (recipientData ?? []) as PrizeRecipientRow[];
  }

  const itemsByRecipient = await fetchItemsByRecipient(
    recipients.map((r) => r.id)
  );

  const recipientsByGroup = new Map<string, PrizeRecipientRow[]>();
  for (const r of recipients) {
    const list = recipientsByGroup.get(r.group_id) ?? [];
    list.push(r);
    recipientsByGroup.set(r.group_id, list);
  }

  const groupViews: PrizeGroupView[] = groupRows.map((group) => {
    const groupRecipients = recipientsByGroup.get(group.id) ?? [];
    const leadRecipient = groupRecipients.find((r) => r.role === "lead");
    const meta = placementMeta(group.round_entry_id, finals.tabulation);

    return {
      id: group.id,
      placement: group.placement,
      sharedPrizes: group.shared_prizes,
      displayName: meta.displayName,
      bibNumber: meta.bibNumber,
      recipients: groupRecipients.map((recipient) => {
        const items = itemsForRecipient(
          recipient,
          leadRecipient,
          itemsByRecipient,
          group.shared_prizes
        );
        return {
          id: recipient.id,
          role: recipient.role,
          firstName: recipient.first_name,
          lastName: recipient.last_name,
          email: recipient.email,
          emailSentAt: recipient.email_sent_at,
          prizesUpdatedAt: recipient.prizes_updated_at,
          canSend: recipientCanSend(recipient, items),
          sendStatus: recipientSendStatus(recipient, items),
          items: items.map((item) => ({
            id: item.id,
            description: item.description,
            redemptionCode: item.redemption_code,
            sortOrder: item.sort_order,
          })),
        };
      }),
    };
  });

  const existingRoundEntries = new Set(groupRows.map((g) => g.round_entry_id));
  const nextFinisher = computeNextFinisher(allPlacements, existingRoundEntries);

  return {
    finalsReady: true,
    competition,
    nextPlacement: nextFinisher?.placement ?? null,
    groups: groupViews,
  };
}

export async function addNextPrizeGroup(competitionId: string) {
  const finals = await resolveFinalsRound(competitionId);
  const allPlacements = listFinalsPlacements(finals.tabulation);

  const { data: existing } = await supabaseServer
    .from("comp_prize_groups")
    .select("round_entry_id")
    .eq("competition_id", competitionId);

  const existingRoundEntries = new Set(
    (existing ?? []).map((g) => g.round_entry_id as string)
  );
  const next = computeNextFinisher(allPlacements, existingRoundEntries);

  if (next == null) {
    throw new PrizeAwardsError("No more placements to add", 409);
  }

  await seedPrizeGroupForPlacement(
    competitionId,
    next.placement,
    next.roundEntryId
  );

  return buildPrizesPayload(competitionId);
}

async function bumpRecipientTimestamps(recipientIds: string[]) {
  if (recipientIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabaseServer
    .from("comp_prize_recipients")
    .update({ prizes_updated_at: now })
    .in("id", recipientIds);
  if (error) {
    throw new PrizeAwardsError("Failed to update prize timestamps", 500);
  }
}

async function replaceRecipientItems(
  recipientId: string,
  items: PrizeItemPayload[]
) {
  const { error: deleteError } = await supabaseServer
    .from("comp_prize_items")
    .delete()
    .eq("recipient_id", recipientId);
  if (deleteError) {
    throw new PrizeAwardsError("Failed to update prize items", 500);
  }

  if (items.length === 0) {
    await insertEmptyItems(recipientId);
    return;
  }

  const rows = items.map((item, index) => ({
    recipient_id: recipientId,
    description: item.description ?? "",
    redemption_code: item.redemptionCode?.trim() || null,
    sort_order: item.sortOrder ?? index,
  }));

  const { error: insertError } = await supabaseServer
    .from("comp_prize_items")
    .insert(rows);
  if (insertError) {
    throw new PrizeAwardsError("Failed to save prize items", 500);
  }
}

async function copyLeadItemsToFollow(leadId: string, followId: string) {
  const { data: leadItems, error } = await supabaseServer
    .from("comp_prize_items")
    .select("description, redemption_code, sort_order")
    .eq("recipient_id", leadId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new PrizeAwardsError("Failed to copy prize items", 500);
  }

  await supabaseServer.from("comp_prize_items").delete().eq("recipient_id", followId);

  if (!leadItems?.length) {
    await insertEmptyItems(followId);
    return;
  }

  const { error: insertError } = await supabaseServer.from("comp_prize_items").insert(
    leadItems.map((item) => ({
      recipient_id: followId,
      description: item.description,
      redemption_code: item.redemption_code,
      sort_order: item.sort_order,
    }))
  );
  if (insertError) {
    throw new PrizeAwardsError("Failed to copy prize items", 500);
  }
}

export async function savePrizesPatch(
  competitionId: string,
  groups: PrizeGroupPatchPayload[]
) {
  for (const groupPatch of groups) {
    const { data: group, error: groupError } = await supabaseServer
      .from("comp_prize_groups")
      .select("*")
      .eq("id", groupPatch.id)
      .eq("competition_id", competitionId)
      .maybeSingle();

    if (groupError || !group) {
      throw new PrizeAwardsError("Prize group not found", 404);
    }

    const groupRow = group as PrizeGroupRow;
    let sharedPrizes = groupRow.shared_prizes;

    if (groupPatch.sharedPrizes != null && groupPatch.sharedPrizes !== sharedPrizes) {
      sharedPrizes = groupPatch.sharedPrizes;
      const { error: updateError } = await supabaseServer
        .from("comp_prize_groups")
        .update({ shared_prizes: sharedPrizes })
        .eq("id", groupRow.id);
      if (updateError) {
        throw new PrizeAwardsError("Failed to update shared prizes setting", 500);
      }

      const { data: groupRecipients } = await supabaseServer
        .from("comp_prize_recipients")
        .select("id, role")
        .eq("group_id", groupRow.id);

      const lead = groupRecipients?.find((r) => r.role === "lead");
      const follow = groupRecipients?.find((r) => r.role === "follow");

      if (sharedPrizes && follow) {
        await supabaseServer
          .from("comp_prize_items")
          .delete()
          .eq("recipient_id", follow.id);
      } else if (!sharedPrizes && lead && follow) {
        await copyLeadItemsToFollow(lead.id, follow.id);
      }
    }

    if (!groupPatch.recipients?.length) continue;

    const { data: groupRecipients } = await supabaseServer
      .from("comp_prize_recipients")
      .select("*")
      .eq("group_id", groupRow.id);

    const recipientRows = (groupRecipients ?? []) as PrizeRecipientRow[];
    const leadRecipient = recipientRows.find((r) => r.role === "lead");
    const followRecipient = recipientRows.find((r) => r.role === "follow");
    const touchedRecipientIds = new Set<string>();

    for (const recipientPatch of groupPatch.recipients) {
      const recipient = recipientRows.find((r) => r.id === recipientPatch.id);
      if (!recipient) continue;

      if (recipientPatch.email != null) {
        const { error: emailError } = await supabaseServer
          .from("comp_prize_recipients")
          .update({ email: recipientPatch.email.trim() || null })
          .eq("id", recipient.id);
        if (emailError) {
          throw new PrizeAwardsError("Failed to update recipient email", 500);
        }
        touchedRecipientIds.add(recipient.id);
      }

      if (recipientPatch.items == null) continue;

      if (sharedPrizes) {
        if (recipient.role !== "lead" || !leadRecipient) continue;
        await replaceRecipientItems(leadRecipient.id, recipientPatch.items);
        touchedRecipientIds.add(leadRecipient.id);
        if (followRecipient) touchedRecipientIds.add(followRecipient.id);
      } else {
        await replaceRecipientItems(recipient.id, recipientPatch.items);
        touchedRecipientIds.add(recipient.id);
      }
    }

    if (touchedRecipientIds.size > 0) {
      await bumpRecipientTimestamps([...touchedRecipientIds]);
    }
  }

  return buildPrizesPayload(competitionId);
}

export async function loadRecipientForSend(recipientId: string, competitionId: string) {
  const { data: recipient, error } = await supabaseServer
    .from("comp_prize_recipients")
    .select("*, group:comp_prize_groups(*, competition:competitions(id, name, comp_type))")
    .eq("id", recipientId)
    .maybeSingle();

  if (error || !recipient?.group) {
    throw new PrizeAwardsError("Recipient not found", 404);
  }

  const group = recipient.group as PrizeGroupRow & {
    competition: { id: string; name: string; comp_type: string };
  };

  if (group.competition_id !== competitionId) {
    throw new PrizeAwardsError("Recipient not found", 404);
  }

  const { data: groupRecipients } = await supabaseServer
    .from("comp_prize_recipients")
    .select("*")
    .eq("group_id", group.id);

  const recipientRows = (groupRecipients ?? []) as PrizeRecipientRow[];
  const leadRecipient = recipientRows.find((r) => r.role === "lead");
  const itemsByRecipient = await fetchItemsByRecipient(
    recipientRows.map((r) => r.id)
  );

  const recipientRow = recipient as PrizeRecipientRow;
  const items = itemsForRecipient(
    recipientRow,
    leadRecipient,
    itemsByRecipient,
    group.shared_prizes
  );

  if (!recipientCanSend(recipientRow, items)) {
    throw new PrizeAwardsError("Recipient is not ready to receive a prize email", 409);
  }

  const finals = await resolveFinalsRound(competitionId);
  const meta = placementMeta(group.round_entry_id, finals.tabulation);

  return {
    recipient: recipientRow,
    group,
    competition: group.competition,
    placement: group.placement,
    displayName: meta.displayName,
    items,
  };
}

export async function markRecipientEmailSent(recipientId: string) {
  const now = new Date().toISOString();
  const { error } = await supabaseServer
    .from("comp_prize_recipients")
    .update({ email_sent_at: now })
    .eq("id", recipientId);
  if (error) {
    throw new PrizeAwardsError("Failed to record email send", 500);
  }
}

export async function listSendableRecipients(competitionId: string) {
  const payload = await buildPrizesPayload(competitionId);
  const sendable: string[] = [];
  for (const group of payload.groups) {
    for (const recipient of group.recipients) {
      if (recipient.canSend) sendable.push(recipient.id);
    }
  }
  return { payload, sendableRecipientIds: sendable };
}
