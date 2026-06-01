import { supabaseServer } from "@/lib/supabaseServer";
import {
  computeSocialSplit,
  totalRevenueFromMetricsRow,
  type MetricsRevenueInput,
} from "@/lib/socialFinancesConstants";

/** All optional migration columns present. */
export const SOCIAL_FINANCE_SELECT_FULL =
  "id,event_id,venue_cost,other_expense,other_expense_comment,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,ccs_profit,ccs_cash_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

/** @deprecated Use SOCIAL_FINANCE_SELECT_FULL */
export const SOCIAL_FINANCE_SELECT_WITH_CCS = SOCIAL_FINANCE_SELECT_FULL;

/** Missing ccs_cash_profit only — keeps other_expense columns. */
export const SOCIAL_FINANCE_SELECT_NO_CCS_CASH =
  "id,event_id,venue_cost,other_expense,other_expense_comment,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,ccs_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

/** Missing both CCS columns — keeps other_expense columns. */
export const SOCIAL_FINANCE_SELECT_NO_CCS =
  "id,event_id,venue_cost,other_expense,other_expense_comment,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

/** Missing other_expense_comment only — keeps other_expense + CCS columns. */
export const SOCIAL_FINANCE_SELECT_NO_OTHER_COMMENT =
  "id,event_id,venue_cost,other_expense,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,ccs_profit,ccs_cash_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

/** Missing comment + ccs_cash — keeps other_expense amount + ccs_profit. */
export const SOCIAL_FINANCE_SELECT_NO_COMMENT_NO_CCS_CASH =
  "id,event_id,venue_cost,other_expense,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,ccs_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

export const SOCIAL_FINANCE_SELECT_LEGACY =
  "id,event_id,venue_cost,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,isaiah_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at,updated_at";

const SOCIAL_FINANCE_SELECT_FALLBACKS: string[] = [
  SOCIAL_FINANCE_SELECT_FULL,
  SOCIAL_FINANCE_SELECT_NO_CCS_CASH,
  SOCIAL_FINANCE_SELECT_NO_OTHER_COMMENT,
  SOCIAL_FINANCE_SELECT_NO_CCS,
  SOCIAL_FINANCE_SELECT_NO_COMMENT_NO_CCS_CASH,
  SOCIAL_FINANCE_SELECT_LEGACY,
];

function isRecoverableSocialFinanceSelectError(error: unknown): boolean {
  return (
    isMissingCcsProfitColumn(error) ||
    isMissingCcsCashProfitColumn(error) ||
    isMissingSocialFinanceColumn(error, "other_expense") ||
    isMissingSocialFinanceColumn(error, "other_expense_comment")
  );
}

function selectIncludesColumn(select: string, column: string): boolean {
  return select.split(",").some((part) => part.trim() === column);
}

export type SocialFinancesRow = {
  id: string;
  event_id: string;
  venue_cost: number;
  other_expense: number;
  other_expense_comment: string | null;
  brandon_split_ratio: number;
  kyler_split_ratio: number;
  isaiah_split_ratio: number;
  brandon_profit: number;
  kyler_profit: number;
  isaiah_profit: number;
  ccs_profit: number;
  ccs_cash_profit: number;
  brandon_paid_at: string | null;
  kyler_paid_at: string | null;
  isaiah_paid_at: string | null;
  updated_at: string;
};

type SocialFinanceRowRaw = Partial<SocialFinancesRow> & {
  id: string;
  event_id: string;
  venue_cost: number;
  brandon_split_ratio: number;
  kyler_split_ratio: number;
  isaiah_split_ratio: number;
  brandon_profit: number;
  kyler_profit: number;
  isaiah_profit: number;
  brandon_paid_at: string | null;
  kyler_paid_at: string | null;
  isaiah_paid_at: string | null;
  updated_at: string;
  ccs_profit?: number | null;
  ccs_cash_profit?: number | null;
  other_expense?: number | null;
  other_expense_comment?: string | null;
};

async function querySocialFinanceRowByEventId(
  eventId: string,
  selectCols: string
): Promise<{ data: SocialFinanceRowRaw | null; error: unknown | null }> {
  const { data, error } = await supabaseServer
    .from("the_social_finances")
    .select(selectCols)
    .eq("event_id", eventId)
    .maybeSingle();

  return { data: (data ?? null) as SocialFinanceRowRaw | null, error };
}

export function isMissingCcsProfitColumn(error: unknown): boolean {
  return isMissingSocialFinanceColumn(error, "ccs_profit");
}

export function isMissingCcsCashProfitColumn(error: unknown): boolean {
  return isMissingSocialFinanceColumn(error, "ccs_cash_profit");
}

export function isMissingSocialFinanceColumn(error: unknown, column: string): boolean {
  const e = error as { message?: string; code?: string; details?: string };
  const msg = `${e?.message ?? ""} ${e?.details ?? ""}`.toLowerCase();
  const col = column.toLowerCase();
  if (e?.code === "42703" && msg.includes(col)) return true;
  return (
    msg.includes(col) &&
    (msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      msg.includes("could not find"))
  );
}

export const SOCIAL_FINANCES_MIGRATION_HINT =
  "Apply pending Supabase migrations for the_social_finances (ccs_profit, ccs_cash_profit, other_expense, other_expense_comment).";

export function normalizeSocialFinanceRow(raw: SocialFinanceRowRaw): SocialFinancesRow {
  const comment = raw.other_expense_comment;
  return {
    id: raw.id,
    event_id: raw.event_id,
    venue_cost: Number(raw.venue_cost) || 0,
    other_expense: Number(raw.other_expense ?? 0) || 0,
    other_expense_comment: typeof comment === "string" ? comment : null,
    brandon_split_ratio: Number(raw.brandon_split_ratio) || 0.2,
    kyler_split_ratio: Number(raw.kyler_split_ratio) || 0.3,
    isaiah_split_ratio: Number(raw.isaiah_split_ratio) || 0.5,
    brandon_profit: Number(raw.brandon_profit) || 0,
    kyler_profit: Number(raw.kyler_profit) || 0,
    isaiah_profit: Number(raw.isaiah_profit) || 0,
    ccs_profit: Number(raw.ccs_profit ?? 0) || 0,
    ccs_cash_profit: Number(raw.ccs_cash_profit ?? 0) || 0,
    brandon_paid_at: raw.brandon_paid_at ?? null,
    kyler_paid_at: raw.kyler_paid_at ?? null,
    isaiah_paid_at: raw.isaiah_paid_at ?? null,
    updated_at: raw.updated_at,
  };
}

export async function loadEventFinanceMetrics(
  eventId: string
): Promise<MetricsRevenueInput | null> {
  const { data } = await supabaseServer
    .from("event_finance_metrics")
    .select("cash_total,stripe_total,other_total,ccs_team_total")
    .eq("event_id", eventId)
    .maybeSingle();
  return data;
}

function needsCcsFieldsRecompute(row: SocialFinanceRowRaw): boolean {
  const ccs = row.ccs_profit;
  const ccsCash = row.ccs_cash_profit;
  return (
    ccs == null ||
    !Number.isFinite(Number(ccs)) ||
    ccsCash == null ||
    !Number.isFinite(Number(ccsCash))
  );
}

export function attachComputedCcsFields(
  row: SocialFinanceRowRaw,
  metrics: MetricsRevenueInput | null
): SocialFinancesRow {
  const normalized = normalizeSocialFinanceRow(row);
  if (!needsCcsFieldsRecompute(row) && metrics === null) {
    return normalized;
  }
  if (!metrics) {
    return normalized;
  }

  const totalRevenue = totalRevenueFromMetricsRow(metrics);
  const cashTotal = Number(metrics.cash_total ?? 0);
  const split = computeSocialSplit({
    totalRevenue,
    cashTotal,
    venueCost: normalized.venue_cost,
    otherExpense: normalized.other_expense,
    brandonRatio: normalized.brandon_split_ratio,
    kylerRatio: normalized.kyler_split_ratio,
    isaiahRatio: normalized.isaiah_split_ratio,
    brandonProfitOverride: normalized.brandon_profit,
    kylerProfitOverride: normalized.kyler_profit,
  });

  return {
    ...normalized,
    isaiah_profit: split.isaiah_profit,
    ccs_profit: split.ccs_profit,
    ccs_cash_profit: split.ccs_cash_profit,
  };
}

/** @deprecated Use attachComputedCcsFields */
export const attachComputedCcsProfit = attachComputedCcsFields;

export async function fetchSocialFinancesByEventId(
  eventId: string
): Promise<{ data: SocialFinancesRow | null; error: unknown | null }> {
  let lastError: unknown = null;

  for (const selectCols of SOCIAL_FINANCE_SELECT_FALLBACKS) {
    const result = await querySocialFinanceRowByEventId(eventId, selectCols);

    if (result.error) {
      lastError = result.error;
      if (!isRecoverableSocialFinanceSelectError(result.error)) {
        return { data: null, error: result.error };
      }
      continue;
    }

    if (!result.data) {
      return { data: null, error: null };
    }

    const raw = result.data;
    const needsMetricsForCcs =
      !selectIncludesColumn(selectCols, "ccs_profit") ||
      !selectIncludesColumn(selectCols, "ccs_cash_profit");
    const metrics = needsMetricsForCcs || needsCcsFieldsRecompute(raw)
      ? await loadEventFinanceMetrics(eventId)
      : null;

    return {
      data: attachComputedCcsFields(raw, metrics),
      error: null,
    };
  }

  return { data: null, error: lastError };
}

/** Strip columns that may not exist yet when the DB is not fully migrated. */
export function omitOptionalSocialColumns(
  payload: Record<string, unknown>,
  omit: {
    ccs?: boolean;
    ccsCash?: boolean;
    otherExpense?: boolean;
    otherExpenseComment?: boolean;
  }
): Record<string, unknown> {
  const next = { ...payload };
  if (omit.ccs) delete next.ccs_profit;
  if (omit.ccsCash) delete next.ccs_cash_profit;
  if (omit.otherExpense) {
    delete next.other_expense;
    delete next.other_expense_comment;
  }
  if (omit.otherExpenseComment) delete next.other_expense_comment;
  return next;
}

function payloadTouchesOtherExpense(payload: Record<string, unknown>): boolean {
  return "other_expense" in payload || "other_expense_comment" in payload;
}

/** Update with retries only for missing optional columns; fail if other_expense cannot be stored. */
export async function writeSocialFinancesUpdate(
  eventId: string,
  updates: Record<string, unknown>
): Promise<{ error: unknown | null }> {
  let payload = { ...updates };
  let omittedCcs = false;
  let omittedCcsCash = false;
  let omittedOtherComment = false;

  for (let attempt = 0; attempt < 6; attempt++) {
    const write = await supabaseServer
      .from("the_social_finances")
      .update(payload)
      .eq("event_id", eventId);

    if (!write.error) {
      return { error: null };
    }

    if (
      isMissingSocialFinanceColumn(write.error, "other_expense") &&
      payloadTouchesOtherExpense(payload)
    ) {
      return { error: write.error };
    }

    let stripped = false;

    if (isMissingCcsCashProfitColumn(write.error) && !omittedCcsCash) {
      omittedCcsCash = true;
      payload = omitOptionalSocialColumns(payload, { ccsCash: true });
      stripped = true;
    } else if (isMissingCcsProfitColumn(write.error) && !omittedCcs) {
      omittedCcs = true;
      payload = omitOptionalSocialColumns(payload, { ccs: true });
      stripped = true;
    } else if (
      isMissingSocialFinanceColumn(write.error, "other_expense_comment") &&
      !omittedOtherComment
    ) {
      omittedOtherComment = true;
      payload = omitOptionalSocialColumns(payload, { otherExpenseComment: true });
      stripped = true;
    } else if (
      isMissingSocialFinanceColumn(write.error, "other_expense") &&
      !payloadTouchesOtherExpense(payload)
    ) {
      payload = omitOptionalSocialColumns(payload, { otherExpense: true });
      stripped = true;
    }

    if (!stripped) {
      return { error: write.error };
    }
  }

  return { error: new Error("writeSocialFinancesUpdate: max retries exceeded") };
}

/** Insert with retries only for missing optional columns; fail if other_expense cannot be stored. */
export async function writeSocialFinancesInsert(
  payload: Record<string, unknown>
): Promise<{ error: unknown | null }> {
  let row = { ...payload };
  let omittedCcs = false;
  let omittedCcsCash = false;
  let omittedOtherComment = false;

  for (let attempt = 0; attempt < 6; attempt++) {
    const insert = await supabaseServer.from("the_social_finances").insert(row);

    if (!insert.error) {
      return { error: null };
    }

    if (
      isMissingSocialFinanceColumn(insert.error, "other_expense") &&
      payloadTouchesOtherExpense(row)
    ) {
      return { error: insert.error };
    }

    let stripped = false;

    if (isMissingCcsCashProfitColumn(insert.error) && !omittedCcsCash) {
      omittedCcsCash = true;
      row = omitOptionalSocialColumns(row, { ccsCash: true });
      stripped = true;
    } else if (isMissingCcsProfitColumn(insert.error) && !omittedCcs) {
      omittedCcs = true;
      row = omitOptionalSocialColumns(row, { ccs: true });
      stripped = true;
    } else if (
      isMissingSocialFinanceColumn(insert.error, "other_expense_comment") &&
      !omittedOtherComment
    ) {
      omittedOtherComment = true;
      row = omitOptionalSocialColumns(row, { otherExpenseComment: true });
      stripped = true;
    } else if (
      isMissingSocialFinanceColumn(insert.error, "other_expense") &&
      !payloadTouchesOtherExpense(row)
    ) {
      row = omitOptionalSocialColumns(row, { otherExpense: true });
      stripped = true;
    }

    if (!stripped) {
      return { error: insert.error };
    }
  }

  return { error: new Error("writeSocialFinancesInsert: max retries exceeded") };
}

export async function selectSocialFinancesAfterWrite(
  eventId: string
): Promise<{ data: SocialFinancesRow | null; error: unknown | null }> {
  return fetchSocialFinancesByEventId(eventId);
}
