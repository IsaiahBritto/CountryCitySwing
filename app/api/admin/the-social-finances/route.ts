import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireFinanceAuth } from "@/lib/financeAuth";

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

const SELECT_COLS =
  "id,event_id,venue_cost,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

async function totalRevenueFromMetrics(eventId: string): Promise<number> {
  const { data: m } = await supabaseServer
    .from("event_finance_metrics")
    .select("cash_total,stripe_total,other_total,ccs_team_total")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!m) return 0;
  return round2(
    Number(m.cash_total ?? 0) +
      Number(m.stripe_total ?? 0) +
      Number(m.other_total ?? 0) +
      Number(m.ccs_team_total ?? 0)
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    const auth = await requireFinanceAuth(req, { eventId });
    if (!auth.ok) return auth.response;

    const { data, error } = await supabaseServer
      .from("the_social_finances")
      .select(SELECT_COLS)
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      console.error("the-social-finances GET:", error);
      return NextResponse.json(
        { error: "Failed to fetch social finances" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? null });
  } catch (e) {
    console.error("the-social-finances GET:", e);
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
    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    if (!eventId) {
      return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const {
      venue_cost: venueCost,
      brandon_split_ratio: brandonSplitRatio,
      kyler_split_ratio: kylerSplitRatio,
      isaiah_split_ratio: isaiahSplitRatio,
      brandon_profit: brandonProfit,
      kyler_profit: kylerProfit,
      isaiah_profit: isaiahProfit,
      mark_brandon_paid: markBrandonPaid,
      mark_kyler_paid: markKylerPaid,
      mark_isaiah_paid: markIsaiahPaid,
    } = body;

    const { data: existing } = await supabaseServer
      .from("the_social_finances")
      .select(SELECT_COLS)
      .eq("event_id", eventId)
      .maybeSingle();

    const parseRatio = (v: unknown, fallback: number): number => {
      if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
      return Math.min(1, Math.max(0, v));
    };

    const parseMoney = (v: unknown): number | undefined => {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
      return round2(v);
    };

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: now };

      if (typeof venueCost === "number" && venueCost >= 0) {
        updates.venue_cost = round2(venueCost);
      }
      if ("brandon_split_ratio" in body) {
        updates.brandon_split_ratio = parseRatio(brandonSplitRatio, Number(existing.brandon_split_ratio) || 0.2);
      }
      if ("kyler_split_ratio" in body) {
        updates.kyler_split_ratio = parseRatio(kylerSplitRatio, Number(existing.kyler_split_ratio) || 0.3);
      }
      if ("isaiah_split_ratio" in body) {
        updates.isaiah_split_ratio = parseRatio(isaiahSplitRatio, Number(existing.isaiah_split_ratio) || 0.5);
      }
      if ("brandon_profit" in body) {
        const p = parseMoney(brandonProfit);
        if (p !== undefined) updates.brandon_profit = p;
      }
      if ("kyler_profit" in body) {
        const p = parseMoney(kylerProfit);
        if (p !== undefined) updates.kyler_profit = p;
      }
      if ("isaiah_profit" in body) {
        const p = parseMoney(isaiahProfit);
        if (p !== undefined) updates.isaiah_profit = p;
      }
      if (markBrandonPaid === true) {
        updates.brandon_paid_at = now;
      }
      if (markKylerPaid === true) {
        updates.kyler_paid_at = now;
      }
      if (markIsaiahPaid === true) {
        updates.isaiah_paid_at = now;
      }

      const { data, error } = await supabaseServer
        .from("the_social_finances")
        .update(updates)
        .eq("event_id", eventId)
        .select(SELECT_COLS)
        .single();

      if (error) {
        console.error("the-social-finances PATCH update:", error);
        return NextResponse.json(
          { error: "Failed to update social finances" },
          { status: 500 }
        );
      }
      return NextResponse.json({ data });
    }

    // Insert: seed from metrics + defaults (Brandon 20%, Kyler 30%, Isaiah 50%).
    const totalRev = await totalRevenueFromMetrics(eventId);
    const venue =
      typeof venueCost === "number" && venueCost >= 0 ? round2(venueCost) : 0;
    const br = "brandon_split_ratio" in body ? parseRatio(brandonSplitRatio, 0.2) : 0.2;
    const ky = "kyler_split_ratio" in body ? parseRatio(kylerSplitRatio, 0.3) : 0.3;
    const isa = "isaiah_split_ratio" in body ? parseRatio(isaiahSplitRatio, 0.5) : 0.5;
    const distributable = Math.max(0, round2(totalRev - venue));

    const defaultBrandon = round2(distributable * br);
    const defaultKyler = round2(distributable * ky);
    const defaultIsaiah = round2(distributable * isa);

    const bp =
      parseMoney(brandonProfit) ??
      defaultBrandon;
    const kp =
      parseMoney(kylerProfit) ??
      defaultKyler;
    const ip =
      parseMoney(isaiahProfit) ??
      defaultIsaiah;

    const { data, error } = await supabaseServer
      .from("the_social_finances")
      .insert({
        event_id: eventId,
        venue_cost: venue,
        brandon_split_ratio: br,
        kyler_split_ratio: ky,
        isaiah_split_ratio: isa,
        brandon_profit: bp,
        kyler_profit: kp,
        isaiah_profit: ip,
        brandon_paid_at: markBrandonPaid === true ? now : null,
        kyler_paid_at: markKylerPaid === true ? now : null,
        isaiah_paid_at: markIsaiahPaid === true ? now : null,
        updated_at: now,
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("the-social-finances PATCH insert:", error);
      return NextResponse.json(
        { error: "Failed to create social finances" },
        { status: 500 }
      );
    }
    return NextResponse.json({ data });
  } catch (e) {
    console.error("the-social-finances PATCH:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
