import { NextRequest, NextResponse } from "next/server";
import {
  COMMUNITY_OFFLINE_PAYMENT_METHOD,
  isApprovedCommunityEvent,
  parseCommunityPaymentMethods,
} from "@/lib/communityEvents";
import {
  checkDuplicateCommunityCompSignupByEmailFromRows,
  resolveGuestCommunityCompSignup,
  type GuestCommunityCompSignupBody,
} from "@/lib/communityCompSignupGuest";
import { buildSignupSummaryFromGuestPayload } from "@/lib/email/communityCompSignupConfirmationEmail";
import { sendCommunityCompSignupConfirmations } from "@/lib/email/sendCommunityCompSignupConfirmations";
import { supabaseServer } from "@/lib/supabaseServer";
import { clientIpFromRequest, rateLimit } from "@/lib/spotify/rateLimit";

export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = rateLimit({
    key: `non-ccs-comp-signup:${ip}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    );
  }

  const data = (await req.json()) as GuestCommunityCompSignupBody & {
    event?: { id?: string; title?: string };
    accept_liability?: boolean;
    accept_payment?: boolean | string;
    accept_refund?: boolean | string;
    selected_payment_method_id?: string;
  };

  const event = data.event ?? {};
  const eventId = event.id;
  const eventTitle = event.title ?? "Comp Event";
  const strictlySelected = !!data.strictly_selected;
  const jnjSelected = !!data.jnj_selected;
  const acceptLiability = !!data.accept_liability;
  const acceptPayment =
    data.accept_payment === true || data.accept_payment === "true";
  const acceptRefundExplicit =
    data.accept_refund === true || data.accept_refund === "true";
  const paymentMethodId =
    typeof data.selected_payment_method_id === "string"
      ? data.selected_payment_method_id.trim()
      : "";

  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }
  if (!strictlySelected && !jnjSelected) {
    return NextResponse.json(
      { error: "Select at least one division" },
      { status: 400 }
    );
  }
  if (!acceptLiability) {
    return NextResponse.json(
      { error: "You must accept the liability release" },
      { status: 400 }
    );
  }
  if (!acceptPayment) {
    return NextResponse.json(
      { error: "You must acknowledge offline payment terms" },
      { status: 400 }
    );
  }
  if (!paymentMethodId) {
    return NextResponse.json(
      { error: "Select a payment method" },
      { status: 400 }
    );
  }

  const { data: eventRow, error: eventErr } = await supabaseServer
    .from("events")
    .select(
      "host_kind, approval_status, community_payment_methods, strictly_price, jnj_price, refund_statement, title, starts_at, location, time_zone"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventErr || !eventRow || !isApprovedCommunityEvent(eventRow)) {
    return NextResponse.json({ error: "Event not available for signup" }, { status: 404 });
  }

  const refundStatement =
    eventRow.refund_statement && String(eventRow.refund_statement).trim()
      ? String(eventRow.refund_statement).trim()
      : "";
  if (refundStatement && !acceptRefundExplicit) {
    return NextResponse.json(
      { error: "You must acknowledge the refund policy for this event." },
      { status: 400 }
    );
  }

  const methods = parseCommunityPaymentMethods(eventRow.community_payment_methods);
  const chosen = methods.find((m) => m.id === paymentMethodId);
  if (!chosen) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const resolved = resolveGuestCommunityCompSignup(data, {
    strictlySelected,
    jnjSelected,
  });
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: existingSignups } = await supabaseServer
    .from("comp_signups")
    .select(
      "strictly_selected, strictly_lead_email, strictly_follow_email, jnj_selected, jnj_lead_email, jnj_follow_email"
    )
    .eq("event_id", eventId)
    .neq("refunded_or_cancelled", "cancelled");

  const isDuplicate = checkDuplicateCommunityCompSignupByEmailFromRows(
    existingSignups ?? [],
    resolved,
    { strictlySelected, jnjSelected }
  );
  if (isDuplicate) {
    return NextResponse.json(
      { error: "Already registered", alreadyRegistered: true, eventTitle },
      { status: 409 }
    );
  }

  const amountOwed =
    (strictlySelected ? Number(eventRow.strictly_price) || 0 : 0) +
    (jnjSelected ? Number(eventRow.jnj_price) || 0 : 0);

  const insertRow: Record<string, unknown> = {
    event_id: eventId,
    event_title: eventTitle,
    registrant_profile_id: null,
    strictly_selected: strictlySelected,
    strictly_price: eventRow.strictly_price ?? null,
    strictly_lead_profile_id: null,
    strictly_follow_profile_id: null,
    strictly_lead_first_name: resolved.strictly_lead_first_name,
    strictly_lead_last_name: resolved.strictly_lead_last_name,
    strictly_lead_email: resolved.strictly_lead_email,
    strictly_follow_first_name: resolved.strictly_follow_first_name,
    strictly_follow_last_name: resolved.strictly_follow_last_name,
    strictly_follow_email: resolved.strictly_follow_email,
    jnj_selected: jnjSelected,
    jnj_price: eventRow.jnj_price ?? null,
    jnj_lead_profile_id: null,
    jnj_follow_profile_id: null,
    jnj_lead_first_name: resolved.jnj_lead_first_name,
    jnj_lead_last_name: resolved.jnj_lead_last_name,
    jnj_lead_email: resolved.jnj_lead_email,
    jnj_follow_first_name: resolved.jnj_follow_first_name,
    jnj_follow_last_name: resolved.jnj_follow_last_name,
    jnj_follow_email: resolved.jnj_follow_email,
    payment_method: COMMUNITY_OFFLINE_PAYMENT_METHOD,
    amount_owed: amountOwed,
    paid: false,
    accept_liability: acceptLiability,
    accept_payment: acceptPayment,
    selected_payment_method_id: paymentMethodId,
    selected_payment_method_label: chosen.label,
  };

  const { data: inserted, error: insertError } = await supabaseServer
    .from("comp_signups")
    .insert([insertRow])
    .select("id")
    .single();

  if (insertError) {
    console.error("[non-ccs-comp-signup]", insertError);
    return NextResponse.json({ error: "Failed to save registration" }, { status: 500 });
  }

  const summary = buildSignupSummaryFromGuestPayload(data, resolved, {
    strictlySelected,
    jnjSelected,
    amountOwed,
    paymentMethodLabel: chosen.label,
  });
  if (summary) {
    const displayTitle =
      (eventRow.title && String(eventRow.title).trim()) || eventTitle;
    void sendCommunityCompSignupConfirmations({
      event: {
        title: displayTitle,
        starts_at: eventRow.starts_at as string | null,
        location: eventRow.location as string | null,
        time_zone: eventRow.time_zone as string | null,
      },
      summary,
      resolved,
      strictlySelected,
    });
  }

  return NextResponse.json({ success: true, compSignupId: inserted.id });
}
