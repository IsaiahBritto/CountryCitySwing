import { supabaseServer } from "@/lib/supabaseServer";
import {
  parseCommunityPaymentMethods,
  validateCommunityEventSubmit,
  validateCommunityLevels,
  type CommunityPaymentMethod,
  type EventApprovalStatus,
} from "@/lib/communityEvents";

const EVENT_SELECT =
  "id,title,starts_at,ends_at,location,description,time_zone,type,host_kind,approval_status,organizer_profile_id,submitted_at,approval_reviewed_at,approval_rejection_reason,community_payment_methods,community_payment_disclaimer,community_payment_disclaimer_tone,strictly_price,jnj_price,strictly_level,jnj_level,refund_statement";

export async function loadCommunityEventForOrganizer(
  eventId: string,
  userId: string,
  isAdmin: boolean
) {
  const { data, error } = await supabaseServer
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", eventId)
    .eq("host_kind", "community")
    .maybeSingle();
  if (error || !data) return null;
  if (!isAdmin && data.organizer_profile_id !== userId) return null;
  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type, status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return { ...data, competitions: competitions ?? [] };
}

export function validateSubmitPayload(event: {
  title?: string | null;
  starts_at?: string | null;
  location?: string | null;
  community_payment_methods?: unknown;
  competitions?: { id: string }[] | null;
}): string | null {
  return validateCommunityEventSubmit(event);
}

export type CommunityEventPatch = {
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  location?: string;
  description?: string | null;
  time_zone?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  community_payment_methods?: CommunityPaymentMethod[];
  community_payment_disclaimer?: string | null;
  community_payment_disclaimer_tone?: string;
};

export function buildCommunityEventUpdate(
  body: Record<string, unknown>
): { update: Record<string, unknown>; error?: string } {
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") update.title = body.title.trim();
  if (typeof body.starts_at === "string") update.starts_at = body.starts_at;
  if (body.ends_at !== undefined) update.ends_at = body.ends_at || null;
  if (typeof body.location === "string") update.location = body.location.trim();
  if (body.description !== undefined) {
    update.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.time_zone !== undefined) {
    update.time_zone =
      typeof body.time_zone === "string" ? body.time_zone.trim() || null : null;
  }
  if (body.strictly_price !== undefined) {
    update.strictly_price = body.strictly_price ?? null;
  }
  if (body.jnj_price !== undefined) update.jnj_price = body.jnj_price ?? null;
  if (body.strictly_level !== undefined) {
    update.strictly_level = body.strictly_level ?? null;
  }
  if (body.jnj_level !== undefined) update.jnj_level = body.jnj_level ?? null;
  if (body.community_payment_methods !== undefined) {
    update.community_payment_methods = parseCommunityPaymentMethods(
      body.community_payment_methods
    );
  }
  if (body.community_payment_disclaimer !== undefined) {
    const t =
      typeof body.community_payment_disclaimer === "string"
        ? body.community_payment_disclaimer.trim()
        : "";
    update.community_payment_disclaimer = t || null;
  }
  if (body.community_payment_disclaimer_tone !== undefined) {
    const tone = String(body.community_payment_disclaimer_tone);
    if (tone === "warning" || tone === "danger" || tone === "neutral") {
      update.community_payment_disclaimer_tone = tone;
    }
  }

  const levelErr = validateCommunityLevels(
    (update.strictly_level as string | null) ?? undefined,
    (update.jnj_level as string | null) ?? undefined
  );
  if (levelErr) return { update, error: levelErr };

  return { update };
}

export async function listPublicApprovedCommunityEvents() {
  const { data, error } = await supabaseServer
    .from("events")
    .select(
      "id,title,starts_at,ends_at,location,description,time_zone,strictly_price,jnj_price,strictly_level,jnj_level,community_payment_disclaimer,community_payment_disclaimer_tone"
    )
    .eq("host_kind", "community")
    .eq("approval_status", "approved")
    .eq("type", "Comp")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function canOrganizerEditStatus(status: EventApprovalStatus): boolean {
  return status === "draft" || status === "pending" || status === "rejected";
}
