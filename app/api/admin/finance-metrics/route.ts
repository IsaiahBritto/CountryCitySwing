import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertSocialEvent, requireFinanceAuth } from "@/lib/financeAuth";

interface SignupRow {
  payment_method: string | null;
  paid: boolean | null;
  checked_in: boolean | null;
  is_ccs_team: boolean | null;
  amount_owed: number | null;
  stripe_tax_amount: number | null;
  stripe_processing_fee: number | null;
  free_via_promotion_code: boolean | null;
  used_promotion_code: boolean | null;
}

interface CompSignupRow {
  payment_method: string | null;
  paid: boolean | null;
  checked_in: boolean | null;
  is_ccs_team: boolean | null;
  amount_owed: number | null;
  stripe_tax_amount: number | null;
  stripe_processing_fee: number | null;
}

type Metrics = {
  total_signups: number;
  checked_in_count: number;
  cash_total: number;
  stripe_total: number;
  other_total: number;
  ccs_team_cash_total: number;
  ccs_team_stripe_total: number;
  ccs_team_total: number;
  stripe_taxes_fees_total: number;
  free_via_promo_count: number;
  revenue_from_coupons: number;
  is_comp_event: boolean;
};

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function computeStats(
  signups: SignupRow[],
  eventPrice: number | null,
  eventCcsTeamPrice: number | null | undefined
): Metrics {
  const price = eventPrice ?? 0;
  const ccsTeamPrice = eventCcsTeamPrice != null ? Number(eventCcsTeamPrice) : 0;
  let cashTotal = 0;
  let stripeTotal = 0;
  let otherTotal = 0;
  let ccsTeamCashTotal = 0;
  let ccsTeamStripeTotal = 0;
  let stripeTaxesFees = 0;
  let freeViaPromoCount = 0;
  let revenueFromCoupons = 0;

  for (const s of signups) {
    const pm = (s.payment_method || "").toLowerCase().trim();
    const isCcsTeam = s.is_ccs_team === true || pm === "ccs team";
    const checkedIn = s.checked_in === true;
    const paid = s.paid === true;
    const freeViaPromo = s.free_via_promotion_code === true;
    const usedPromo = s.used_promotion_code === true;

    if (freeViaPromo) freeViaPromoCount += 1;

    if (isCcsTeam) {
      const amount = ccsTeamPrice;
      if (pm === "cash" && checkedIn) {
        ccsTeamCashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "stripe" && paid) {
        ccsTeamStripeTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "ccs team" && checkedIn) {
        ccsTeamCashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      }
    } else {
      if (freeViaPromo) continue;
      const amount = s.amount_owed != null ? Number(s.amount_owed) : price;
      if (pm === "cash" && checkedIn) {
        cashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "stripe" && paid) {
        stripeTotal += amount;
        stripeTaxesFees +=
          (s.stripe_tax_amount ?? 0) + (s.stripe_processing_fee ?? 0);
        if (usedPromo) revenueFromCoupons += amount;
      } else if (checkedIn) {
        otherTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      }
    }
  }

  const checkedInCount = signups.filter((s) => s.checked_in === true).length;
  return {
    total_signups: signups.length,
    checked_in_count: checkedInCount,
    cash_total: round2(cashTotal),
    stripe_total: round2(stripeTotal),
    other_total: round2(otherTotal),
    ccs_team_cash_total: round2(ccsTeamCashTotal),
    ccs_team_stripe_total: round2(ccsTeamStripeTotal),
    ccs_team_total: round2(ccsTeamCashTotal + ccsTeamStripeTotal),
    stripe_taxes_fees_total: round2(stripeTaxesFees),
    free_via_promo_count: freeViaPromoCount,
    revenue_from_coupons: round2(revenueFromCoupons),
    is_comp_event: false,
  };
}

function computeStatsComp(compSignups: CompSignupRow[]): Metrics {
  let cashTotal = 0;
  let stripeTotal = 0;
  let otherTotal = 0;
  let ccsTeamCashTotal = 0;
  let ccsTeamStripeTotal = 0;
  let stripeTaxesFees = 0;

  for (const s of compSignups) {
    const pm = (s.payment_method || "").toLowerCase().trim();
    const amount = Number(s.amount_owed) || 0;
    const isCcsTeam = s.is_ccs_team === true || pm === "ccs team";
    const checkedIn = s.checked_in === true;
    const paid = s.paid === true;

    if (isCcsTeam) {
      if (pm === "cash" && checkedIn) ccsTeamCashTotal += amount;
      else if (pm === "stripe" && paid) ccsTeamStripeTotal += amount;
    } else {
      if (pm === "cash" && checkedIn) cashTotal += amount;
      else if (pm === "stripe" && paid) {
        stripeTotal += amount;
        stripeTaxesFees +=
          (s.stripe_tax_amount ?? 0) + (s.stripe_processing_fee ?? 0);
      } else if (checkedIn) otherTotal += amount;
    }
  }

  const checkedInCount = compSignups.filter((s) => s.checked_in === true).length;
  return {
    total_signups: compSignups.length,
    checked_in_count: checkedInCount,
    cash_total: round2(cashTotal),
    stripe_total: round2(stripeTotal),
    other_total: round2(otherTotal),
    ccs_team_cash_total: round2(ccsTeamCashTotal),
    ccs_team_stripe_total: round2(ccsTeamStripeTotal),
    ccs_team_total: round2(ccsTeamCashTotal + ccsTeamStripeTotal),
    stripe_taxes_fees_total: round2(stripeTaxesFees),
    free_via_promo_count: 0,
    revenue_from_coupons: 0,
    is_comp_event: true,
  };
}

async function computeAndPersistMetrics(eventId: string) {
  const { data: eventRow, error: eventError } = await supabaseServer
    .from("events")
    .select("id,type,price,ccs_team_price")
    .eq("id", eventId)
    .single();

  if (eventError || !eventRow) {
    throw new Error("Event not found");
  }

  const isComp = (eventRow.type || "").toLowerCase() === "comp";
  const now = new Date().toISOString();
  let metrics: Metrics;

  if (isComp) {
    const { data, error } = await supabaseServer
      .from("comp_signups")
      .select(
        "payment_method,paid,checked_in,is_ccs_team,amount_owed,stripe_tax_amount,stripe_processing_fee"
      )
      .eq("event_id", eventId);
    if (error) throw new Error("Failed to load comp signups");
    metrics = computeStatsComp((data || []) as CompSignupRow[]);
  } else {
    const { data, error } = await supabaseServer
      .from("signups")
      .select(
        "payment_method,paid,checked_in,is_ccs_team,amount_owed,stripe_tax_amount,stripe_processing_fee,free_via_promotion_code,used_promotion_code"
      )
      .eq("event_id", eventId);
    if (error) throw new Error("Failed to load signups");
    metrics = computeStats(
      (data || []) as SignupRow[],
      eventRow.price ?? null,
      eventRow.ccs_team_price ?? null
    );
  }

  const payload = {
    event_id: eventId,
    total_signups: metrics.total_signups,
    checked_in_count: metrics.checked_in_count,
    cash_total: metrics.cash_total,
    stripe_total: metrics.stripe_total,
    other_total: metrics.other_total,
    ccs_team_cash_total: metrics.ccs_team_cash_total,
    ccs_team_stripe_total: metrics.ccs_team_stripe_total,
    ccs_team_total: metrics.ccs_team_total,
    stripe_taxes_fees_total: metrics.stripe_taxes_fees_total,
    free_via_promo_count: metrics.free_via_promo_count,
    revenue_from_coupons: metrics.revenue_from_coupons,
    is_comp_event: metrics.is_comp_event,
    refreshed_at: now,
    updated_at: now,
  };

  const { data: saved, error: saveError } = await supabaseServer
    .from("event_finance_metrics")
    .upsert(payload, { onConflict: "event_id" })
    .select(
      "event_id,total_signups,checked_in_count,cash_total,stripe_total,other_total,ccs_team_cash_total,ccs_team_stripe_total,ccs_team_total,stripe_taxes_fees_total,free_via_promo_count,revenue_from_coupons,is_comp_event,refreshed_at,updated_at"
    )
    .single();

  if (saveError || !saved) {
    throw new Error("Failed to save finance metrics");
  }
  return saved;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    const eventIdsRaw = searchParams.get("event_ids");

    if (auth.access.level === "social_viewer") {
      if (eventIdsRaw) {
        return NextResponse.json(
          { error: "Forbidden: Bulk finance metrics not allowed" },
          { status: 403 }
        );
      }
      if (!eventId) {
        return NextResponse.json(
          { error: "Missing event_id parameter" },
          { status: 400 }
        );
      }
      const socialErr = await assertSocialEvent(eventId);
      if (socialErr) return socialErr;
    }

    const selectCols =
      "event_id,total_signups,checked_in_count,cash_total,stripe_total,other_total,ccs_team_cash_total,ccs_team_stripe_total,ccs_team_total,stripe_taxes_fees_total,free_via_promo_count,revenue_from_coupons,is_comp_event,refreshed_at,updated_at";

    if (eventId) {
      const { data, error } = await supabaseServer
        .from("event_finance_metrics")
        .select(selectCols)
        .eq("event_id", eventId)
        .maybeSingle();

      if (error) {
        console.error("finance-metrics GET:", error);
        return NextResponse.json(
          { error: "Failed to fetch finance metrics" },
          { status: 500 }
        );
      }
      return NextResponse.json({ data: data ?? null });
    }

    if (eventIdsRaw) {
      const eventIds = eventIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (eventIds.length === 0) {
        return NextResponse.json({ data: [] });
      }

      const { data, error } = await supabaseServer
        .from("event_finance_metrics")
        .select(selectCols)
        .in("event_id", eventIds);

      if (error) {
        console.error("finance-metrics GET (bulk):", error);
        return NextResponse.json(
          { error: "Failed to fetch finance metrics" },
          { status: 500 }
        );
      }
      return NextResponse.json({ data: data ?? [] });
    }

    return NextResponse.json(
      { error: "Missing event_id or event_ids parameter" },
      { status: 400 }
    );
  } catch (e) {
    console.error("finance-metrics GET error:", e);
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

    const hasManualOverrides =
      "cash_total" in body ||
      "stripe_total" in body ||
      "stripe_taxes_fees_total" in body;

    const selectCols =
      "event_id,total_signups,checked_in_count,cash_total,stripe_total,other_total,ccs_team_cash_total,ccs_team_stripe_total,ccs_team_total,stripe_taxes_fees_total,free_via_promo_count,revenue_from_coupons,is_comp_event,refreshed_at,updated_at";

    if (hasManualOverrides) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ("cash_total" in body) {
        const cash = Number(body.cash_total);
        if (!Number.isFinite(cash) || cash < 0) {
          return NextResponse.json(
            { error: "cash_total must be a non-negative number" },
            { status: 400 }
          );
        }
        updates.cash_total = round2(cash);
      }

      if ("stripe_total" in body) {
        const stripe = Number(body.stripe_total);
        if (!Number.isFinite(stripe) || stripe < 0) {
          return NextResponse.json(
            { error: "stripe_total must be a non-negative number" },
            { status: 400 }
          );
        }
        updates.stripe_total = round2(stripe);
      }

      if ("stripe_taxes_fees_total" in body) {
        const fees = Number(body.stripe_taxes_fees_total);
        if (!Number.isFinite(fees) || fees < 0) {
          return NextResponse.json(
            { error: "stripe_taxes_fees_total must be a non-negative number" },
            { status: 400 }
          );
        }
        updates.stripe_taxes_fees_total = round2(fees);
      }

      const { data: existing } = await supabaseServer
        .from("event_finance_metrics")
        .select("event_id")
        .eq("event_id", eventId)
        .maybeSingle();

      // Ensure baseline row exists before applying manual overrides.
      if (!existing) {
        await computeAndPersistMetrics(eventId);
      }

      const { data, error } = await supabaseServer
        .from("event_finance_metrics")
        .update(updates)
        .eq("event_id", eventId)
        .select(selectCols)
        .single();

      if (error || !data) {
        throw new Error("Failed to save manual finance overrides");
      }

      return NextResponse.json({ data });
    }

    const data = await computeAndPersistMetrics(eventId);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("finance-metrics PATCH error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Failed to refresh finance metrics" },
      { status: 500 }
    );
  }
}
