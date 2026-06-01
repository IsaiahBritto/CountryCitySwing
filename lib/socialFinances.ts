import { supabaseServer } from "@/lib/supabaseServer";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import {
  DEFAULT_SOCIAL_BRANDON_RATIO,
  DEFAULT_SOCIAL_ISAIAH_RATIO,
  DEFAULT_SOCIAL_KYLER_RATIO,
  DEFAULT_SOCIAL_VENUE_COST,
  computeSocialSplit,
  totalRevenueFromMetricsRow,
} from "@/lib/socialFinancesConstants";
import {
  fetchSocialFinancesByEventId,
  loadEventFinanceMetrics,
  selectSocialFinancesAfterWrite,
  writeSocialFinancesInsert,
  writeSocialFinancesUpdate,
  type SocialFinancesRow,
} from "@/lib/socialFinancesDb";

export type { SocialFinancesRow };

export async function syncSocialFinancesFromMetrics(
  eventId: string
): Promise<SocialFinancesRow | null> {
  const { data: eventRow, error: eventError } = await supabaseServer
    .from("events")
    .select("id,type")
    .eq("id", eventId)
    .single();

  if (eventError || !eventRow) {
    throw new Error("Event not found");
  }

  if (!isSocialEventType(eventRow.type)) {
    return null;
  }

  const metrics = await loadEventFinanceMetrics(eventId);
  const totalRevenue = totalRevenueFromMetricsRow(metrics);
  const cashTotal = Number(metrics?.cash_total ?? 0);

  const { data: existing } = await fetchSocialFinancesByEventId(eventId);

  const now = new Date().toISOString();

  if (existing) {
    const venueCost = Number(existing.venue_cost) || 0;
    const otherExpense = Number(existing.other_expense) || 0;
    const brandonRatio =
      Number(existing.brandon_split_ratio) || DEFAULT_SOCIAL_BRANDON_RATIO;
    const kylerRatio = Number(existing.kyler_split_ratio) || DEFAULT_SOCIAL_KYLER_RATIO;
    const isaiahRatio =
      Number(existing.isaiah_split_ratio) || DEFAULT_SOCIAL_ISAIAH_RATIO;
    const split = computeSocialSplit({
      totalRevenue,
      cashTotal,
      venueCost,
      otherExpense,
      brandonRatio,
      kylerRatio,
      isaiahRatio,
    });

    const updates = {
      brandon_profit: split.brandon_profit,
      kyler_profit: split.kyler_profit,
      isaiah_profit: split.isaiah_profit,
      ccs_profit: split.ccs_profit,
      ccs_cash_profit: split.ccs_cash_profit,
      updated_at: now,
    };

    const { error } = await writeSocialFinancesUpdate(eventId, updates);
    if (error) {
      throw new Error("Failed to update social finances");
    }

    const refreshed = await selectSocialFinancesAfterWrite(eventId);
    if (refreshed.error || !refreshed.data) {
      throw new Error("Failed to load social finances after update");
    }
    return refreshed.data;
  }

  const venueCost = DEFAULT_SOCIAL_VENUE_COST;
  const split = computeSocialSplit({
    totalRevenue,
    cashTotal,
    venueCost,
    otherExpense: 0,
    brandonRatio: DEFAULT_SOCIAL_BRANDON_RATIO,
    kylerRatio: DEFAULT_SOCIAL_KYLER_RATIO,
    isaiahRatio: DEFAULT_SOCIAL_ISAIAH_RATIO,
  });

  const insertPayload = {
    event_id: eventId,
    venue_cost: venueCost,
    other_expense: 0,
    other_expense_comment: null,
    brandon_split_ratio: DEFAULT_SOCIAL_BRANDON_RATIO,
    kyler_split_ratio: DEFAULT_SOCIAL_KYLER_RATIO,
    isaiah_split_ratio: DEFAULT_SOCIAL_ISAIAH_RATIO,
    brandon_profit: split.brandon_profit,
    kyler_profit: split.kyler_profit,
    isaiah_profit: split.isaiah_profit,
    ccs_profit: split.ccs_profit,
    ccs_cash_profit: split.ccs_cash_profit,
    updated_at: now,
  };

  const { error } = await writeSocialFinancesInsert(insertPayload);
  if (error) {
    throw new Error("Failed to create social finances");
  }

  const refreshed = await selectSocialFinancesAfterWrite(eventId);
  if (refreshed.error || !refreshed.data) {
    throw new Error("Failed to load social finances after create");
  }
  return refreshed.data;
}
