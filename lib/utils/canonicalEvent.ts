import { supabaseServer } from "@/lib/supabaseServer";
import {
  normalizePriceChanges,
  type PriceChange,
} from "@/lib/utils/workshopPricing";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/dateHelpers";

export type CanonicalEvent = {
  id: string;
  title: string;
  type: string;
  starts_at: string | null;
  location: string | null;
  time_zone: string;
  price: number;
  price_changes: PriceChange[];
  ccs_team_price: number | null;
  ccs_team_price_changes: PriceChange[];
  refund_statement: string | null;
};

export class CanonicalEventError extends Error {
  code: "MISSING_EVENT_ID" | "EVENT_NOT_FOUND";

  constructor(code: "MISSING_EVENT_ID" | "EVENT_NOT_FOUND", message: string) {
    super(message);
    this.code = code;
  }
}

function parseMoney(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function resolveCanonicalEventById(eventId: unknown): Promise<CanonicalEvent> {
  const id = typeof eventId === "string" ? eventId.trim() : "";
  if (!id) {
    throw new CanonicalEventError("MISSING_EVENT_ID", "Missing event_id.");
  }

  const { data, error } = await supabaseServer
    .from("events")
    .select(
      "id,title,type,starts_at,location,time_zone,price,price_changes,ccs_team_price,ccs_team_price_changes,refund_statement"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new CanonicalEventError(
      "EVENT_NOT_FOUND",
      "The selected event was not found. Please refresh and try again."
    );
  }

  return {
    id: String(data.id),
    title: data.title ? String(data.title) : "Event",
    type: data.type ? String(data.type) : "",
    starts_at: data.starts_at ? String(data.starts_at) : null,
    location: data.location ? String(data.location) : null,
    time_zone:
      data.time_zone && String(data.time_zone).trim()
        ? String(data.time_zone).trim()
        : DEFAULT_TIME_ZONE,
    price: parseMoney(data.price) ?? 0,
    price_changes: normalizePriceChanges(data.price_changes),
    ccs_team_price: parseMoney(data.ccs_team_price),
    ccs_team_price_changes: normalizePriceChanges(data.ccs_team_price_changes),
    refund_statement:
      data.refund_statement && String(data.refund_statement).trim()
        ? String(data.refund_statement).trim()
        : null,
  };
}
