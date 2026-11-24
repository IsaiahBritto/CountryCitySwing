/** Community (Non-CCS) hosted comp events. */

export type EventHostKind = "ccs" | "community";

export type EventApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export type CommunityPaymentDisclaimerTone =
  | "neutral"
  | "warning"
  | "danger";

export interface CommunityPaymentMethod {
  id: string;
  label: string;
}

export interface CommunityEventRow {
  host_kind?: EventHostKind | null;
  approval_status?: EventApprovalStatus | null;
  organizer_profile_id?: string | null;
  community_payment_methods?: CommunityPaymentMethod[] | null;
  community_payment_disclaimer?: string | null;
  community_payment_disclaimer_tone?: CommunityPaymentDisclaimerTone | null;
}

export const TN_STATE_LEVEL = "TN State";

export function isCommunityEvent(
  row: CommunityEventRow | null | undefined
): boolean {
  return (row?.host_kind ?? "ccs") === "community";
}

export function isApprovedCommunityEvent(
  row: CommunityEventRow | null | undefined
): boolean {
  return (
    isCommunityEvent(row) && (row?.approval_status ?? "approved") === "approved"
  );
}

/** Safe for CCS homepage / GET /api/events public consumers. */
export function isPublicCcsHomepageEvent(
  row: CommunityEventRow | null | undefined
): boolean {
  const host = row?.host_kind ?? "ccs";
  if (host === "ccs") return true;
  return false;
}

export function parseCommunityPaymentMethods(
  value: unknown
): CommunityPaymentMethod[] {
  if (!Array.isArray(value)) return [];
  const out: CommunityPaymentMethod[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = typeof (item as { id?: unknown }).id === "string"
      ? (item as { id: string }).id.trim()
      : "";
    const label = typeof (item as { label?: unknown }).label === "string"
      ? (item as { label: string }).label.trim()
      : "";
    if (!id || !label) continue;
    out.push({ id, label });
  }
  return out;
}

export function validateCommunityLevels(
  strictlyLevel: string | null | undefined,
  jnjLevel: string | null | undefined
): string | null {
  if (strictlyLevel === TN_STATE_LEVEL || jnjLevel === TN_STATE_LEVEL) {
    return "TN State level is not allowed for community events";
  }
  return null;
}

export const COMMUNITY_OFFLINE_PAYMENT_METHOD = "CommunityOffline";

/** Required fields before an organizer can submit for CCS approval. */
export function validateCommunityEventSubmit(event: {
  title?: string | null;
  starts_at?: string | null;
  location?: string | null;
  community_payment_methods?: unknown;
  competitions?: { id: string }[] | null;
}): string | null {
  if (!event.title?.trim()) return "Event title is required";
  if (!event.starts_at) return "Start date and time is required";
  if (!event.location?.trim()) return "Location is required";
  const methods = parseCommunityPaymentMethods(event.community_payment_methods);
  if (methods.length === 0) return "At least one payment method with a label is required";
  const comps = event.competitions ?? [];
  if (comps.length === 0) return "At least one comp division is required";
  return null;
}

export type CommunitySubmitRequirement = {
  id: string;
  label: string;
  met: boolean;
};

export function communityEventSubmitRequirements(event: {
  title?: string | null;
  starts_at?: string | null;
  location?: string | null;
  community_payment_methods?: unknown;
  competitions?: { id: string }[] | null;
}): CommunitySubmitRequirement[] {
  const methods = parseCommunityPaymentMethods(event.community_payment_methods);
  return [
    { id: "title", label: "Event title", met: Boolean(event.title?.trim()) },
    {
      id: "starts",
      label: "Start date and time",
      met: Boolean(event.starts_at),
    },
    {
      id: "location",
      label: "Location",
      met: Boolean(event.location?.trim()),
    },
    {
      id: "payment",
      label: "At least one payment method",
      met: methods.length > 0,
    },
    {
      id: "divisions",
      label: "At least one comp division",
      met: (event.competitions ?? []).length > 0,
    },
  ];
}

export function canOrganizerEditStatus(status: EventApprovalStatus): boolean {
  return (
    status === "draft" ||
    status === "pending" ||
    status === "approved" ||
    status === "rejected"
  );
}
