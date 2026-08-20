import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_UPPER_LEVEL_TEACHER } from "@/lib/nashvilleEventTitle";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireFinanceAuth } from "@/lib/financeAuth";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("nashville_night_finances")
      .select("id,event_id,venue_cost,cash_override,stripe_override,bt1_name,bt2_name,bt3_name,bt4_name,upper_level_teacher_name,bt1_payout_override,bt2_payout_override,bt3_payout_override,bt4_payout_override,upper_level_payout_override,bt1_paid,bt2_paid,bt3_paid,bt4_paid,upper_level_paid,bt1_paid_at,bt2_paid_at,bt3_paid_at,bt4_paid_at,upper_level_paid_at,updated_at")
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      console.error("nashville-night-finances GET:", error);
      return NextResponse.json(
        { error: "Failed to fetch Nashville night finances" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? null });
  } catch (e) {
    console.error("nashville-night-finances GET:", e);
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
      bt1_name: bt1Name,
      bt2_name: bt2Name,
      bt3_name: bt3Name,
      bt4_name: bt4Name,
      upper_level_teacher_name: upperLevelTeacherName,
      bt1_payout_override: bt1PayoutOverride,
      bt2_payout_override: bt2PayoutOverride,
      bt3_payout_override: bt3PayoutOverride,
      bt4_payout_override: bt4PayoutOverride,
      upper_level_payout_override: upperLevelPayoutOverride,
      mark_bt1_paid: markBt1Paid,
      mark_bt2_paid: markBt2Paid,
      mark_bt3_paid: markBt3Paid,
      mark_bt4_paid: markBt4Paid,
      mark_upper_level_paid: markUpperLevelPaid,
    } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: existing } = await supabaseServer
      .from("nashville_night_finances")
      .select("id, venue_cost, bt1_name, bt2_name, bt3_name, bt4_name, upper_level_teacher_name, bt1_payout_override, bt2_payout_override, bt3_payout_override, bt4_payout_override, upper_level_payout_override, bt1_paid, bt2_paid, bt3_paid, bt4_paid, upper_level_paid, bt1_paid_at, bt2_paid_at, bt3_paid_at, bt4_paid_at, upper_level_paid_at")
      .eq("event_id", eventId)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (typeof venueCost === "number" && venueCost >= 0) updates.venue_cost = venueCost;
    if ("cash_override" in body) updates.cash_override = typeof cashOverride === "number" ? cashOverride : null;
    if ("stripe_override" in body) updates.stripe_override = typeof stripeOverride === "number" ? stripeOverride : null;
    if (typeof bt1Name === "string" && bt1Name.trim()) updates.bt1_name = bt1Name.trim();
    if (typeof bt2Name === "string" && bt2Name.trim()) updates.bt2_name = bt2Name.trim();
    if ("bt3_name" in body) updates.bt3_name = typeof bt3Name === "string" && bt3Name.trim() ? bt3Name.trim() : null;
    if ("bt4_name" in body) updates.bt4_name = typeof bt4Name === "string" && bt4Name.trim() ? bt4Name.trim() : null;
    if (typeof upperLevelTeacherName === "string" && upperLevelTeacherName.trim()) updates.upper_level_teacher_name = upperLevelTeacherName.trim();

    if ("bt1_payout_override" in body) {
      updates.bt1_payout_override = typeof bt1PayoutOverride === "number" ? bt1PayoutOverride : null;
    }
    if ("bt2_payout_override" in body) {
      updates.bt2_payout_override = typeof bt2PayoutOverride === "number" ? bt2PayoutOverride : null;
    }
    if ("bt3_payout_override" in body) {
      updates.bt3_payout_override = typeof bt3PayoutOverride === "number" ? bt3PayoutOverride : null;
    }
    if ("bt4_payout_override" in body) {
      updates.bt4_payout_override = typeof bt4PayoutOverride === "number" ? bt4PayoutOverride : null;
    }
    if ("upper_level_payout_override" in body) {
      updates.upper_level_payout_override = typeof upperLevelPayoutOverride === "number" ? upperLevelPayoutOverride : null;
    }

    if (markBt1Paid === true) {
      updates.bt1_paid = true;
      updates.bt1_paid_at = now;
    }
    if (markBt2Paid === true) {
      updates.bt2_paid = true;
      updates.bt2_paid_at = now;
    }
    if (markBt3Paid === true) {
      updates.bt3_paid = true;
      updates.bt3_paid_at = now;
    }
    if (markBt4Paid === true) {
      updates.bt4_paid = true;
      updates.bt4_paid_at = now;
    }
    if (markUpperLevelPaid === true) {
      updates.upper_level_paid = true;
      updates.upper_level_paid_at = now;
    }

    let result;

    if (existing) {
      const { data, error } = await supabaseServer
        .from("nashville_night_finances")
        .update(updates)
        .eq("event_id", eventId)
        .select()
        .single();

      if (error) {
        console.error("nashville-night-finances PATCH update:", error);
        return NextResponse.json(
          { error: "Failed to update Nashville night finances" },
          { status: 500 }
        );
      }
      result = data;
    } else {
      const { data, error } = await supabaseServer
        .from("nashville_night_finances")
        .insert({
          event_id: eventId,
          venue_cost: updates.venue_cost ?? 0,
          cash_override: updates.cash_override ?? null,
          stripe_override: updates.stripe_override ?? null,
          bt1_name: updates.bt1_name ?? "Beginner Teacher 1",
          bt2_name: updates.bt2_name ?? "Beginner Teacher 2",
          bt3_name: updates.bt3_name ?? null,
          bt4_name: updates.bt4_name ?? null,
          upper_level_teacher_name: updates.upper_level_teacher_name ?? DEFAULT_UPPER_LEVEL_TEACHER,
          bt1_payout_override: updates.bt1_payout_override ?? null,
          bt2_payout_override: updates.bt2_payout_override ?? null,
          bt3_payout_override: updates.bt3_payout_override ?? null,
          bt4_payout_override: updates.bt4_payout_override ?? null,
          upper_level_payout_override: updates.upper_level_payout_override ?? null,
          bt1_paid: updates.bt1_paid ?? false,
          bt1_paid_at: updates.bt1_paid_at ?? null,
          bt2_paid: updates.bt2_paid ?? false,
          bt2_paid_at: updates.bt2_paid_at ?? null,
          bt3_paid: updates.bt3_paid ?? false,
          bt3_paid_at: updates.bt3_paid_at ?? null,
          bt4_paid: updates.bt4_paid ?? false,
          bt4_paid_at: updates.bt4_paid_at ?? null,
          upper_level_paid: updates.upper_level_paid ?? false,
          upper_level_paid_at: updates.upper_level_paid_at ?? null,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        console.error("nashville-night-finances PATCH insert:", error);
        return NextResponse.json(
          { error: "Failed to create Nashville night finances" },
          { status: 500 }
        );
      }
      result = data;
    }

    return NextResponse.json({ data: result });
  } catch (e) {
    console.error("nashville-night-finances PATCH:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
