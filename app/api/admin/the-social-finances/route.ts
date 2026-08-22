import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAuth } from "@/lib/financeAuth";
import {
  DEFAULT_SOCIAL_VENUE_COST,
  computeSocialDoorPayouts,
  computeSocialSplit,
  isSocialDoorPayoutModel,
  normalizeDoorPayouts,
  totalRevenueFromMetricsRow,
  type SocialDoorPayoutRow,
} from "@/lib/socialFinancesConstants";
import {
  SOCIAL_FINANCES_MIGRATION_HINT,
  fetchSocialFinancesByEventId,
  isMissingCcsProfitColumn,
  isMissingSocialFinanceColumn,
  loadEventFinanceMetrics,
  selectSocialFinancesAfterWrite,
  writeSocialFinancesInsert,
  writeSocialFinancesUpdate,
} from "@/lib/socialFinancesDb";
import { syncSocialDoorPayoutsFromSchedule } from "@/lib/socialDoorFinanceSync";
import { applyDoorPayoutMarkPaid } from "@/lib/socialDoorPayoutsMerge";
import { supabaseServer } from "@/lib/supabaseServer";

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

async function loadEventStartMeta(eventId: string) {
  const { data } = await supabaseServer
    .from("events")
    .select("starts_at, time_zone")
    .eq("id", eventId)
    .maybeSingle();
  return data;
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

    const meta = await loadEventStartMeta(eventId);
    if (isSocialDoorPayoutModel(meta?.starts_at, meta?.time_zone)) {
      try {
        await syncSocialDoorPayoutsFromSchedule(eventId);
      } catch (e) {
        console.error("the-social-finances GET door sync:", e);
      }
    }

    const { data, error } = await fetchSocialFinancesByEventId(eventId);

    if (error) {
      console.error("the-social-finances GET:", error);
      const hint = isMissingCcsProfitColumn(error) ? ` ${SOCIAL_FINANCES_MIGRATION_HINT}` : "";
      return NextResponse.json(
        { error: `Failed to fetch social finances.${hint}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
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
    const meta = await loadEventStartMeta(eventId);
    const doorModel = isSocialDoorPayoutModel(meta?.starts_at, meta?.time_zone);

    const {
      venue_cost: venueCost,
      other_expense: otherExpense,
      other_expense_comment: otherExpenseComment,
      brandon_split_ratio: brandonSplitRatio,
      kyler_split_ratio: kylerSplitRatio,
      isaiah_split_ratio: isaiahSplitRatio,
      brandon_profit: brandonProfit,
      kyler_profit: kylerProfit,
      ccs_profit: ccsProfit,
      mark_brandon_paid: markBrandonPaid,
      mark_kyler_paid: markKylerPaid,
      mark_isaiah_paid: markIsaiahPaid,
      door_payouts: doorPayoutsBody,
      mark_door_paid_index: markDoorPaidIndex,
      mark_door_paid_slot_id: markDoorPaidSlotId,
    } = body;

    const trimmedMarkDoorPaidSlotId =
      typeof markDoorPaidSlotId === "string" ? markDoorPaidSlotId.trim() : "";
    const wantsMarkDoorPaid =
      trimmedMarkDoorPaidSlotId.length > 0 ||
      (typeof markDoorPaidIndex === "number" &&
        Number.isInteger(markDoorPaidIndex) &&
        markDoorPaidIndex >= 0);

    let { data: existing } = await fetchSocialFinancesByEventId(eventId);

    if (wantsMarkDoorPaid && doorModel && !existing) {
      try {
        await syncSocialDoorPayoutsFromSchedule(eventId);
      } catch (e) {
        console.error("the-social-finances PATCH door sync before mark paid:", e);
      }
      ({ data: existing } = await fetchSocialFinancesByEventId(eventId));
    }

    const parseRatio = (v: unknown, fallback: number): number => {
      if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
      return Math.min(1, Math.max(0, v));
    };

    const parseMoney = (v: unknown): number | undefined => {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
      return round2(v);
    };

    const shouldRecalcIsaiahCcs =
      !doorModel &&
      ("venue_cost" in body ||
        "other_expense" in body ||
        "brandon_split_ratio" in body ||
        "kyler_split_ratio" in body ||
        "isaiah_split_ratio" in body ||
        "brandon_profit" in body ||
        "kyler_profit" in body);

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: now };

      if (typeof venueCost === "number" && venueCost >= 0) {
        updates.venue_cost = round2(venueCost);
      }
      if ("other_expense" in body) {
        const p = parseMoney(otherExpense);
        if (p !== undefined) updates.other_expense = p;
      }
      if ("other_expense_comment" in body) {
        updates.other_expense_comment =
          typeof otherExpenseComment === "string"
            ? otherExpenseComment.trim() || null
            : otherExpenseComment === null
              ? null
              : undefined;
        if (updates.other_expense_comment === undefined) {
          delete updates.other_expense_comment;
        }
      }

      if ("door_payouts" in body) {
        updates.door_payouts = normalizeDoorPayouts(doorPayoutsBody);
      }

      if (wantsMarkDoorPaid) {
        let doors = normalizeDoorPayouts(
          updates.door_payouts ?? existing.door_payouts
        );
        let markResult = applyDoorPayoutMarkPaid(doors, {
          slotId: trimmedMarkDoorPaidSlotId || undefined,
          index:
            typeof markDoorPaidIndex === "number" &&
            Number.isInteger(markDoorPaidIndex)
              ? markDoorPaidIndex
              : undefined,
          paidAt: now,
        });

        if (!markResult.marked && doorModel && trimmedMarkDoorPaidSlotId) {
          try {
            await syncSocialDoorPayoutsFromSchedule(eventId);
          } catch (e) {
            console.error("the-social-finances PATCH door sync on mark paid:", e);
          }
          const resynced = await fetchSocialFinancesByEventId(eventId);
          doors = normalizeDoorPayouts(
            updates.door_payouts ?? resynced.data?.door_payouts
          );
          markResult = applyDoorPayoutMarkPaid(doors, {
            slotId: trimmedMarkDoorPaidSlotId,
            paidAt: now,
          });
        }

        if (!markResult.marked) {
          return NextResponse.json(
            { error: "Door payout row not found for mark paid" },
            { status: 400 }
          );
        }
        updates.door_payouts = markResult.doors;
      }

      if (doorModel) {
        updates.brandon_profit = 0;
        updates.kyler_profit = 0;
        updates.brandon_split_ratio = 0;
        updates.kyler_split_ratio = 0;
        const metrics = await loadEventFinanceMetrics(eventId);
        const doors = normalizeDoorPayouts(
          updates.door_payouts ?? existing.door_payouts
        ) as SocialDoorPayoutRow[];
        const payouts = computeSocialDoorPayouts({
          cashTotal: Number(metrics?.cash_total ?? 0),
          stripeTotal: Number(metrics?.stripe_total ?? 0),
          venueCost: Number(updates.venue_cost ?? existing.venue_cost) || 0,
          otherExpense: Number(updates.other_expense ?? existing.other_expense) || 0,
          doorRows: doors,
        });
        updates.isaiah_profit = payouts.isaiahCash;
        updates.ccs_profit = Math.max(0, payouts.ccsElectronic);
        updates.ccs_cash_profit = 0;
      } else {
        if ("brandon_split_ratio" in body) {
          updates.brandon_split_ratio = parseRatio(
            brandonSplitRatio,
            Number(existing.brandon_split_ratio) || 0.2
          );
        }
        if ("kyler_split_ratio" in body) {
          updates.kyler_split_ratio = parseRatio(
            kylerSplitRatio,
            Number(existing.kyler_split_ratio) || 0.3
          );
        }
        if ("isaiah_split_ratio" in body) {
          updates.isaiah_split_ratio = parseRatio(
            isaiahSplitRatio,
            Number(existing.isaiah_split_ratio) || 0.5
          );
        }
        if ("brandon_profit" in body) {
          const p = parseMoney(brandonProfit);
          if (p !== undefined) updates.brandon_profit = p;
        }
        if ("kyler_profit" in body) {
          const p = parseMoney(kylerProfit);
          if (p !== undefined) updates.kyler_profit = p;
        }
        if ("ccs_profit" in body && !shouldRecalcIsaiahCcs) {
          const p = parseMoney(ccsProfit);
          if (p !== undefined) updates.ccs_profit = p;
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

        if (shouldRecalcIsaiahCcs) {
          const metrics = await loadEventFinanceMetrics(eventId);
          const totalRevenue = totalRevenueFromMetricsRow(metrics);
          const cashTotal = Number(metrics?.cash_total ?? 0);
          const venue = Number(updates.venue_cost ?? existing.venue_cost) || 0;
          const otherExp = Number(updates.other_expense ?? existing.other_expense) || 0;
          const brandonRatio = Number(
            updates.brandon_split_ratio ?? existing.brandon_split_ratio
          );
          const kylerRatio = Number(updates.kyler_split_ratio ?? existing.kyler_split_ratio);
          const isaiahRatio = Number(
            updates.isaiah_split_ratio ?? existing.isaiah_split_ratio
          );
          const brandonOverride =
            updates.brandon_profit !== undefined
              ? Number(updates.brandon_profit)
              : undefined;
          const kylerOverride =
            updates.kyler_profit !== undefined ? Number(updates.kyler_profit) : undefined;

          const split = computeSocialSplit({
            totalRevenue,
            cashTotal,
            venueCost: venue,
            otherExpense: otherExp,
            brandonRatio,
            kylerRatio,
            isaiahRatio,
            brandonProfitOverride: brandonOverride,
            kylerProfitOverride: kylerOverride,
          });

          if (brandonOverride === undefined) {
            updates.brandon_profit = split.brandon_profit;
          }
          if (kylerOverride === undefined) {
            updates.kyler_profit = split.kyler_profit;
          }
          updates.isaiah_profit = split.isaiah_profit;
          updates.ccs_profit = split.ccs_profit;
          updates.ccs_cash_profit = split.ccs_cash_profit;
        }
      }

      const write = await writeSocialFinancesUpdate(eventId, updates);

      if (write.error) {
        console.error("the-social-finances PATCH update:", write.error);
        const hint =
          isMissingCcsProfitColumn(write.error) ||
          isMissingSocialFinanceColumn(write.error, "other_expense") ||
          isMissingSocialFinanceColumn(write.error, "other_expense_comment") ||
          isMissingSocialFinanceColumn(write.error, "door_payouts")
            ? ` ${SOCIAL_FINANCES_MIGRATION_HINT}`
            : "";
        return NextResponse.json(
          { error: `Failed to update social finances.${hint}` },
          { status: 500 }
        );
      }

      const refreshed = await selectSocialFinancesAfterWrite(eventId);
      if (refreshed.error) {
        return NextResponse.json(
          { error: "Failed to fetch social finances after update" },
          { status: 500 }
        );
      }
      return NextResponse.json({ data: refreshed.data });
    }

    if (doorModel) {
      const metrics = await loadEventFinanceMetrics(eventId);
      const venue =
        typeof venueCost === "number" && venueCost >= 0
          ? round2(venueCost)
          : DEFAULT_SOCIAL_VENUE_COST;
      const otherExp =
        "other_expense" in body && typeof otherExpense === "number" && otherExpense >= 0
          ? round2(otherExpense)
          : 0;
      const comment =
        "other_expense_comment" in body
          ? typeof otherExpenseComment === "string"
            ? otherExpenseComment.trim() || null
            : null
          : null;
      const doors = normalizeDoorPayouts(doorPayoutsBody);
      const payouts = computeSocialDoorPayouts({
        cashTotal: Number(metrics?.cash_total ?? 0),
        stripeTotal: Number(metrics?.stripe_total ?? 0),
        venueCost: venue,
        otherExpense: otherExp,
        doorRows: doors,
      });
      const insertPayload = {
        event_id: eventId,
        venue_cost: venue,
        other_expense: otherExp,
        other_expense_comment: comment,
        door_payouts: doors,
        brandon_split_ratio: 0,
        kyler_split_ratio: 0,
        isaiah_split_ratio: 1,
        brandon_profit: 0,
        kyler_profit: 0,
        isaiah_profit: payouts.isaiahCash,
        ccs_profit: Math.max(0, payouts.ccsElectronic),
        ccs_cash_profit: 0,
        brandon_paid_at: null,
        kyler_paid_at: null,
        isaiah_paid_at: null,
        updated_at: now,
      };
      const insert = await writeSocialFinancesInsert(insertPayload);
      if (insert.error) {
        console.error("the-social-finances PATCH insert:", insert.error);
        return NextResponse.json(
          { error: `Failed to create social finances. ${SOCIAL_FINANCES_MIGRATION_HINT}` },
          { status: 500 }
        );
      }
      const refreshed = await selectSocialFinancesAfterWrite(eventId);
      return NextResponse.json({ data: refreshed.data });
    }

    const metrics = await loadEventFinanceMetrics(eventId);
    const totalRev = totalRevenueFromMetricsRow(metrics);
    const cashTotal = Number(metrics?.cash_total ?? 0);
    const venue =
      typeof venueCost === "number" && venueCost >= 0
        ? round2(venueCost)
        : DEFAULT_SOCIAL_VENUE_COST;
    const br = "brandon_split_ratio" in body ? parseRatio(brandonSplitRatio, 0.2) : 0.2;
    const ky = "kyler_split_ratio" in body ? parseRatio(kylerSplitRatio, 0.3) : 0.3;
    const isa = "isaiah_split_ratio" in body ? parseRatio(isaiahSplitRatio, 0.5) : 0.5;

    const bp = parseMoney(brandonProfit);
    const kp = parseMoney(kylerProfit);

    const otherExp =
      "other_expense" in body && typeof otherExpense === "number" && otherExpense >= 0
        ? round2(otherExpense)
        : 0;
    const comment =
      "other_expense_comment" in body
        ? typeof otherExpenseComment === "string"
          ? otherExpenseComment.trim() || null
          : null
        : null;

    const split = computeSocialSplit({
      totalRevenue: totalRev,
      cashTotal,
      venueCost: venue,
      otherExpense: otherExp,
      brandonRatio: br,
      kylerRatio: ky,
      isaiahRatio: isa,
      brandonProfitOverride: bp,
      kylerProfitOverride: kp,
    });

    const insertPayload = {
      event_id: eventId,
      venue_cost: venue,
      other_expense: otherExp,
      other_expense_comment: comment,
      door_payouts: [],
      brandon_split_ratio: br,
      kyler_split_ratio: ky,
      isaiah_split_ratio: isa,
      brandon_profit: split.brandon_profit,
      kyler_profit: split.kyler_profit,
      isaiah_profit: split.isaiah_profit,
      ccs_profit: split.ccs_profit,
      ccs_cash_profit: split.ccs_cash_profit,
      brandon_paid_at: markBrandonPaid === true ? now : null,
      kyler_paid_at: markKylerPaid === true ? now : null,
      isaiah_paid_at: markIsaiahPaid === true ? now : null,
      updated_at: now,
    };

    const insert = await writeSocialFinancesInsert(insertPayload);

    if (insert.error) {
      console.error("the-social-finances PATCH insert:", insert.error);
      const hint =
        isMissingCcsProfitColumn(insert.error) ||
        isMissingSocialFinanceColumn(insert.error, "other_expense") ||
        isMissingSocialFinanceColumn(insert.error, "other_expense_comment")
          ? ` ${SOCIAL_FINANCES_MIGRATION_HINT}`
          : "";
      return NextResponse.json(
        { error: `Failed to create social finances.${hint}` },
        { status: 500 }
      );
    }

    const refreshed = await selectSocialFinancesAfterWrite(eventId);
    return NextResponse.json({ data: refreshed.data });
  } catch (e) {
    console.error("the-social-finances PATCH:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
