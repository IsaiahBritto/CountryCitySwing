import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeCheckInArrivalBuckets } from "@/lib/utils/checkInArrivalBuckets";
import {
  assertRegistrationEventMutateAccess,
  assertRegistrationEventViewAccess,
  loadRegistrationEvent,
  requireRegistrationAuth,
  type RegistrationEventRow,
} from "@/lib/registrationAuth";

const COMP_SIGNUPS_SELECT =
  "id,event_id,event_title,strictly_selected,strictly_lead_first_name,strictly_lead_last_name,strictly_lead_email,strictly_follow_first_name,strictly_follow_last_name,strictly_follow_email,jnj_selected,jnj_lead_first_name,jnj_lead_last_name,jnj_lead_email,jnj_follow_first_name,jnj_follow_last_name,jnj_follow_email,payment_method,amount_owed,paid,checked_in,checked_in_at,created_at,is_ccs_team,stripe_tax_amount,stripe_processing_fee";

const SIGNUPS_SELECT =
  "id,event_id,event_title,first_name,last_name,email,payment_method,paid,checked_in,checked_in_at,created_at,is_ccs_team,amount_owed,stripe_tax_amount,stripe_processing_fee,free_via_promotion_code,used_promotion_code";

const EVENT_META_CACHE_TTL_MS = 60_000; // 60 seconds
const eventMetaCache = new Map<
  string,
  { event: RegistrationEventRow; ts: number }
>();

function getCachedEventMeta(eventId: string): RegistrationEventRow | null {
  const entry = eventMetaCache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.ts > EVENT_META_CACHE_TTL_MS) {
    eventMetaCache.delete(eventId);
    return null;
  }
  return entry.event;
}

function setCachedEventMeta(eventId: string, event: RegistrationEventRow) {
  eventMetaCache.set(eventId, { event, ts: Date.now() });
}

async function getEventMetaForAccess(
  eventId: string
): Promise<{ event: RegistrationEventRow | null; error?: NextResponse }> {
  let eventMeta = getCachedEventMeta(eventId);
  if (eventMeta) return { event: eventMeta };

  const loaded = await loadRegistrationEvent(eventId);
  if (!loaded.event) return loaded;
  setCachedEventMeta(eventId, loaded.event);
  return { event: loaded.event };
}

// GET - Fetch signups for an event (admin, instructor, or social registration viewer)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRegistrationAuth(req);
    if (!auth.ok) return auth.response;

    // Get event_id from query params
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    const filter = searchParams.get("filter") || "all"; // all, not_checked_in, checked_in

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    const { event: eventMeta, error: eventError } = await getEventMetaForAccess(eventId);
    if (eventError) return eventError;
    if (!eventMeta) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const accessErr = assertRegistrationEventViewAccess(auth.access.level, eventMeta);
    if (accessErr) return accessErr;

    const eventStartsAt = eventMeta.starts_at;
    const isComp = (eventMeta.type ?? "").toLowerCase() === "comp";

    if (isComp) {
      const { data: compList, error: compError } = await supabaseServer
        .from("comp_signups")
        .select(COMP_SIGNUPS_SELECT)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (compError) {
        console.error("Error fetching comp signups:", compError);
        return NextResponse.json(
          {
            error: "Failed to fetch comp signups",
            details: compError.message,
          },
          { status: 500 }
        );
      }

      const list = compList || [];
      const compCheckedIn = list.filter((c: { checked_in?: boolean }) => c.checked_in === true).length;
      const check_in_arrival_buckets = computeCheckInArrivalBuckets(
        list,
        eventStartsAt
      );
      let compSignups = list;
      if (filter === "not_checked_in") {
        compSignups = list.filter((c: { checked_in?: boolean }) => c.checked_in !== true);
      } else if (filter === "checked_in") {
        compSignups = list.filter((c: { checked_in?: boolean }) => c.checked_in === true);
      }

      return NextResponse.json({
        signups: [],
        compSignups,
        isComp: true,
        total: list.length,
        checked_in: compCheckedIn,
        check_in_arrival_buckets,
      });
    }

    // Regular event: fetch from signups table
    const { data: allSignups, error } = await supabaseServer
      .from("signups")
      .select(SIGNUPS_SELECT)
      .eq("event_id", eventId)
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Error fetching signups:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch signups",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const list = allSignups || [];
    const total = list.length;
    const checked_in = list.filter((s: { checked_in?: boolean }) => s.checked_in === true).length;
    const check_in_arrival_buckets = computeCheckInArrivalBuckets(
      list,
      eventStartsAt
    );

    // Apply filter to list
    let signups = list;
    if (filter === "not_checked_in") {
      signups = list.filter((s: { checked_in?: boolean }) => s.checked_in !== true);
    } else if (filter === "checked_in") {
      signups = list.filter((s: { checked_in?: boolean }) => s.checked_in === true);
    }

    return NextResponse.json({
      signups,
      compSignups: [],
      isComp: false,
      total,
      checked_in,
      check_in_arrival_buckets,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update signup status (admin and instructor only)
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireRegistrationAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { signupId, field, value, isComp } = body;

    if (!signupId || !field || value === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: signupId, field, value" },
        { status: 400 }
      );
    }

    if (isComp) {
      if (field !== "paid" && field !== "checked_in") {
        return NextResponse.json(
          { error: "Comp signups can only update 'paid' or 'checked_in'" },
          { status: 400 }
        );
      }

      const { data: existingComp, error: existingCompError } = await supabaseServer
        .from("comp_signups")
        .select("event_id")
        .eq("id", signupId)
        .single();
      if (existingCompError || !existingComp?.event_id) {
        return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }

      const { event: eventMeta, error: eventError } = await getEventMetaForAccess(
        String(existingComp.event_id)
      );
      if (eventError) return eventError;
      if (!eventMeta) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      const accessErr = assertRegistrationEventMutateAccess(auth.access.level, eventMeta);
      if (accessErr) return accessErr;

      const updatePayload: {
        paid?: boolean;
        checked_in?: boolean;
        checked_in_at?: string | null;
        updated_at: string;
      } = {
        updated_at: new Date().toISOString(),
      };
      if (field === "paid") {
        updatePayload.paid = !!value;
      } else {
        updatePayload.checked_in = !!value;
        if (value === true) {
          updatePayload.paid = true;
          updatePayload.checked_in_at = new Date().toISOString();
        } else {
          updatePayload.checked_in_at = null;
        }
      }
      const { data, error } = await supabaseServer
        .from("comp_signups")
        .update(updatePayload)
        .eq("id", signupId)
        .select()
        .single();
      if (error) {
        console.error("Error updating comp signup:", error);
        return NextResponse.json(
          { error: "Failed to update comp signup", details: error.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, signup: data });
    }

    if (!["paid", "checked_in"].includes(field)) {
      return NextResponse.json(
        { error: "Invalid field. Must be 'paid' or 'checked_in'" },
        { status: 400 }
      );
    }

    const { data: existingSignup, error: existingSignupError } = await supabaseServer
      .from("signups")
      .select("event_id")
      .eq("id", signupId)
      .single();
    if (existingSignupError || !existingSignup?.event_id) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const { event: eventMeta, error: eventError } = await getEventMetaForAccess(
      String(existingSignup.event_id)
    );
    if (eventError) return eventError;
    if (!eventMeta) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const accessErr = assertRegistrationEventMutateAccess(auth.access.level, eventMeta);
    if (accessErr) return accessErr;

    const updateData: Record<string, unknown> = { [field]: value };
    if (field === "checked_in" && value === true) {
      updateData.paid = true;
      updateData.checked_in_at = new Date().toISOString();
    }
    if (field === "checked_in" && value === false) {
      updateData.checked_in_at = null;
    }

    const { data, error } = await supabaseServer
      .from("signups")
      .update(updateData)
      .eq("id", signupId)
      .select()
      .single();

    if (error) {
      console.error("Error updating signup:", error);
      return NextResponse.json(
        { error: "Failed to update signup", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, signup: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
