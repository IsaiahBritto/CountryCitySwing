export interface PrizeItemRow {
  id: string;
  recipient_id: string;
  description: string;
  redemption_code: string | null;
  sort_order: number;
}

export interface PrizeRecipientRow {
  id: string;
  group_id: string;
  role: "lead" | "follow";
  first_name: string;
  last_name: string;
  email: string | null;
  profile_id: string | null;
  email_sent_at: string | null;
  prizes_updated_at: string;
}

export type PrizeSendStatus = "ready" | "sent" | "needs_prizes" | "no_email";

/** Option C: send when email + prizes exist and prizes changed since last send. */
export function recipientCanSend(
  recipient: {
    email: string | null;
    email_sent_at: string | null;
    prizes_updated_at: string;
  },
  items: { description: string }[]
): boolean {
  if (!recipient.email?.trim()) return false;
  if (!items.some((i) => i.description.trim())) return false;
  if (!recipient.email_sent_at) return true;
  return (
    new Date(recipient.prizes_updated_at).getTime() >
    new Date(recipient.email_sent_at).getTime()
  );
}

export function recipientSendStatus(
  recipient: {
    email: string | null;
    email_sent_at: string | null;
    prizes_updated_at: string;
  },
  items: { description: string }[]
): PrizeSendStatus {
  if (!recipient.email?.trim()) return "no_email";
  if (!items.some((i) => i.description.trim())) return "needs_prizes";
  if (recipientCanSend(recipient, items)) return "ready";
  return "sent";
}

export function itemsForRecipient(
  recipient: PrizeRecipientRow,
  leadRecipient: PrizeRecipientRow | undefined,
  itemsByRecipient: Map<string, PrizeItemRow[]>,
  sharedPrizes: boolean
): PrizeItemRow[] {
  if (sharedPrizes && recipient.role === "follow" && leadRecipient) {
    return itemsByRecipient.get(leadRecipient.id) ?? [];
  }
  return itemsByRecipient.get(recipient.id) ?? [];
}

export function computeNextPlacement(
  allPlacements: { placement: number }[],
  existingPlacements: Set<number>
): number | null {
  for (const p of allPlacements) {
    if (!existingPlacements.has(p.placement)) {
      return p.placement;
    }
  }
  return null;
}

/** Next finals finisher not yet given a prize group (by round entry id). */
export function computeNextFinisher<
  T extends { placement: number; roundEntryId: string },
>(allPlacements: T[], existingRoundEntryIds: Set<string>): T | null {
  for (const row of allPlacements) {
    if (!existingRoundEntryIds.has(row.roundEntryId)) {
      return row;
    }
  }
  return null;
}
