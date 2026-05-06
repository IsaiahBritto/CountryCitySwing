import { supabaseServer } from "@/lib/supabaseServer";

export type CanonicalEvent = {
  id: string;
  title: string;
  type: string;
  starts_at: string | null;
  location: string | null;
  price: number;
  day_of_price: number | null;
  ccs_team_price: number | null;
  team_day_of_price: number | null;
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
    .select("id,title,type,starts_at,location,price,day_of_price,ccs_team_price,team_day_of_price")
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
    price: parseMoney(data.price) ?? 0,
    day_of_price: parseMoney(data.day_of_price),
    ccs_team_price: parseMoney(data.ccs_team_price),
    team_day_of_price: parseMoney(data.team_day_of_price),
  };
}
