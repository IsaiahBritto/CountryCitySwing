import { NextRequest, NextResponse } from "next/server";
import { syncClassFinancePayoutsFromSchedule } from "@/lib/classFinanceSync";
import { DEFAULT_UPPER_LEVEL_TEACHER } from "@/lib/nashvilleEventTitle";
import { requireFinanceAuth } from "@/lib/financeAuth";
import { supabaseServer } from "@/lib/supabaseServer";

const BASE_SELECT =
  "id,event_id,venue_cost,cash_override,stripe_override,updated_at";

const PAYOUT_SELECT =
  "id,event_id,team_slot_id,role_label,payee_name,amount,paid_at,sort_order,created_at,updated_at";

async function loadClassEventFinances(eventId: string) {
  await ensureClassFinanceBaseRowForApi(eventId);
  await syncClassFinancePayoutsFromSchedule(eventId);

  const [baseRes, payoutsRes] = await Promise.all([
    supabaseServer.from("nashville_night_finances").select(BASE_SELECT).eq("event_id", eventId).maybeSingle(),
    supabaseServer
      .from("class_event_finance_payouts")
      .select(PAYOUT_SELECT)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (baseRes.error) throw baseRes.error;
  if (payoutsRes.error) throw payoutsRes.error;

  return {
    base: baseRes.data ?? null,
    payouts: payoutsRes.data ?? [],
  };
}

async function ensureClassFinanceBaseRowForApi(eventId: string): Promise<void> {
  const { data: existing } = await supabaseServer
    .from("nashville_night_finances")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) return;

  const now = new Date().toISOString();
  await supabaseServer.from("nashville_night_finances").insert({
    event_id: eventId,
    venue_cost: 0,
    cash_override: null,
    stripe_override: null,
    bt1_name: "Beginner Teacher 1",
    bt2_name: "Beginner Teacher 2",
    bt3_name: null,
    bt4_name: null,
    upper_level_teacher_name: DEFAULT_UPPER_LEVEL_TEACHER,
    bt1_payout_override: null,
    bt2_payout_override: null,
    bt3_payout_override: null,
    bt4_payout_override: null,
    upper_level_payout_override: null,
    bt1_paid: false,
    bt1_paid_at: null,
    bt2_paid: false,
    bt2_paid_at: null,
    bt3_paid: false,
    bt3_paid_at: null,
    bt4_paid: false,
    bt4_paid_at: null,
    upper_level_paid: false,
    upper_level_paid_at: null,
    updated_at: now,
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json({ error: "Missing event_id parameter" }, { status: 400 });
    }

    const data = await loadClassEventFinances(eventId);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("class-event-finances GET:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const {
      event_id: eventId,
      venue_cost: venueCost,
      cash_override: cashOverride,
      stripe_override: stripeOverride,
      payout_id: payoutId,
      role_label: roleLabel,
      payee_name: payeeName,
      amount,
      mark_paid: markPaid,
    } = body;

    if (!eventId) {
      return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (payoutId) {
      const updates: Record<string, unknown> = { updated_at: now };
      if (typeof roleLabel === "string") updates.role_label = roleLabel.trim();
      if (typeof payeeName === "string" && payeeName.trim()) updates.payee_name = payeeName.trim();
      if (typeof amount === "number" && amount >= 0) updates.amount = amount;
      if (markPaid === true) updates.paid_at = now;

      const { data, error } = await supabaseServer
        .from("class_event_finance_payouts")
        .update(updates)
        .eq("id", payoutId)
        .eq("event_id", eventId)
        .select(PAYOUT_SELECT)
        .single();

      if (error) {
        console.error("class-event-finances PATCH payout:", error);
        return NextResponse.json({ error: "Failed to update payout" }, { status: 500 });
      }

      return NextResponse.json({ data: { payout: data } });
    }

    await ensureClassFinanceBaseRowForApi(eventId);

    const updates: Record<string, unknown> = { updated_at: now };
    if (typeof venueCost === "number" && venueCost >= 0) updates.venue_cost = venueCost;
    if ("cash_override" in body) {
      updates.cash_override = typeof cashOverride === "number" ? cashOverride : null;
    }
    if ("stripe_override" in body) {
      updates.stripe_override = typeof stripeOverride === "number" ? stripeOverride : null;
    }

    const { data, error } = await supabaseServer
      .from("nashville_night_finances")
      .update(updates)
      .eq("event_id", eventId)
      .select(BASE_SELECT)
      .single();

    if (error) {
      console.error("class-event-finances PATCH base:", error);
      return NextResponse.json({ error: "Failed to update class event finances" }, { status: 500 });
    }

    return NextResponse.json({ data: { base: data } });
  } catch (e) {
    console.error("class-event-finances PATCH:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const {
      event_id: eventId,
      role_label: roleLabel,
      payee_name: payeeName,
      amount,
    } = body;

    if (!eventId) {
      return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
    }
    if (typeof payeeName !== "string" || !payeeName.trim()) {
      return NextResponse.json({ error: "Missing payee_name" }, { status: 400 });
    }

    await ensureClassFinanceBaseRowForApi(eventId);

    const { data: existing } = await supabaseServer
      .from("class_event_finance_payouts")
      .select("sort_order")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const sortOrder = existing?.[0]?.sort_order != null ? Number(existing[0].sort_order) + 1 : 0;
    const now = new Date().toISOString();

    const { data, error } = await supabaseServer
      .from("class_event_finance_payouts")
      .insert({
        event_id: eventId,
        team_slot_id: null,
        role_label: typeof roleLabel === "string" ? roleLabel.trim() : "",
        payee_name: payeeName.trim(),
        amount: typeof amount === "number" && amount >= 0 ? amount : 0,
        sort_order: sortOrder,
        created_at: now,
        updated_at: now,
      })
      .select(PAYOUT_SELECT)
      .single();

    if (error) {
      console.error("class-event-finances POST:", error);
      return NextResponse.json({ error: "Failed to add payout" }, { status: 500 });
    }

    return NextResponse.json({ data: { payout: data } });
  } catch (e) {
    console.error("class-event-finances POST:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const payoutId = searchParams.get("payout_id");
    const eventId = searchParams.get("event_id");

    if (!payoutId || !eventId) {
      return NextResponse.json({ error: "Missing payout_id or event_id" }, { status: 400 });
    }

    const { data: row } = await supabaseServer
      .from("class_event_finance_payouts")
      .select("team_slot_id")
      .eq("id", payoutId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }

    const { error } = await supabaseServer
      .from("class_event_finance_payouts")
      .delete()
      .eq("id", payoutId)
      .eq("event_id", eventId);

    if (error) {
      console.error("class-event-finances DELETE:", error);
      return NextResponse.json({ error: "Failed to delete payout" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("class-event-finances DELETE:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
