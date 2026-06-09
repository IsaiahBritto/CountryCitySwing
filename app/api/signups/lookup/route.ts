import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCheckInToken } from "@/lib/utils/qrCheckIn";
import {
  assertRegistrationEventViewAccess,
  loadRegistrationEvent,
  requireRegistrationAuth,
} from "@/lib/registrationAuth";

/** GET /api/signups/lookup?token=ccs:s:<id> or token=ccs:c:<id> — returns one signup for QR check-in. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRegistrationAuth(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token parameter" }, { status: 400 });
    }

    const parsed = parseCheckInToken(token);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
    }

    if (parsed.type === "event") {
      const { data, error } = await supabaseServer
        .from("signups")
        .select(
          "id,event_id,event_title,first_name,last_name,email,payment_method,paid,checked_in,checked_in_at"
        )
        .eq("id", parsed.id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }

      const { event, error: eventError } = await loadRegistrationEvent(String(data.event_id));
      if (eventError) return eventError;
      if (!event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      const accessErr = assertRegistrationEventViewAccess(auth.access.level, event);
      if (accessErr) return accessErr;

      return NextResponse.json({ signup: data, isComp: false });
    }

    const { data, error } = await supabaseServer
      .from("comp_signups")
      .select(
        "id,event_id,event_title,strictly_selected,strictly_lead_first_name,strictly_lead_last_name,strictly_follow_first_name,strictly_follow_last_name,jnj_selected,jnj_lead_first_name,jnj_lead_last_name,payment_method,amount_owed,paid,checked_in,checked_in_at"
      )
      .eq("id", parsed.id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const { event, error: eventError } = await loadRegistrationEvent(String(data.event_id));
    if (eventError) return eventError;
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const accessErr = assertRegistrationEventViewAccess(auth.access.level, event);
    if (accessErr) return accessErr;

    return NextResponse.json({ signup: data, isComp: true });
  } catch (err: unknown) {
    console.error("Signups lookup error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
