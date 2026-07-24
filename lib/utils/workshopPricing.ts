import {
  DEFAULT_TIME_ZONE,
  getDateStringInTimeZone,
} from "@/lib/utils/dateHelpers";

export type PriceChange = {
  effective_date: string; // YYYY-MM-DD
  price: number;
};

export type WorkshopPricingInput = {
  price?: number | null;
  price_changes?: PriceChange[] | null;
  ccs_team_price?: number | null;
  ccs_team_price_changes?: PriceChange[] | null;
  time_zone?: string | null;
  type?: string | null;
};

function parsePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normalize DB/API JSON into a sorted list of valid price changes. */
export function normalizePriceChanges(raw: unknown): PriceChange[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceChange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const date =
      typeof rec.effective_date === "string"
        ? rec.effective_date.trim().slice(0, 10)
        : "";
    const price = parsePrice(rec.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || price == null || price < 0) continue;
    out.push({ effective_date: date, price });
  }
  out.sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  return out;
}

/** True if two changes share the same effective_date. */
export function hasDuplicatePriceChangeDates(changes: PriceChange[]): boolean {
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.effective_date)) return true;
    seen.add(c.effective_date);
  }
  return false;
}

export function getTodayStringInTimeZone(timeZone?: string | null): string {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Effective list price: latest change with effective_date <= asOfDate, else base.
 * asOfDate is YYYY-MM-DD in the event time zone.
 */
export function getEffectiveWorkshopPrice(
  basePrice: number | null | undefined,
  changes: PriceChange[] | null | undefined,
  asOfDateYmd: string
): number {
  const base = parsePrice(basePrice) ?? 0;
  const list = normalizePriceChanges(changes);
  let effective = base;
  for (const c of list) {
    if (c.effective_date <= asOfDateYmd) effective = c.price;
    else break;
  }
  return effective;
}

/** Next change date strictly after asOfDate, or null. */
export function getNextPriceChangeDate(
  changes: PriceChange[] | null | undefined,
  asOfDateYmd: string
): string | null {
  const list = normalizePriceChanges(changes);
  for (const c of list) {
    if (c.effective_date > asOfDateYmd) return c.effective_date;
  }
  return null;
}

/**
 * Distinct prices that have already taken effect (base + changes with date <= asOf),
 * sorted ascending — for door Paid buttons.
 */
export function listEffectiveSchedulePrices(
  basePrice: number | null | undefined,
  changes: PriceChange[] | null | undefined,
  asOfDateYmd: string
): number[] {
  const base = parsePrice(basePrice) ?? 0;
  const prices = new Set<number>([base]);
  for (const c of normalizePriceChanges(changes)) {
    if (c.effective_date <= asOfDateYmd) prices.add(c.price);
  }
  return Array.from(prices).sort((a, b) => a - b);
}

/** True once any team base price or team schedule row exists. */
export function isTeamPricingConfigured(
  ccsTeamPrice: number | null | undefined,
  teamChanges: PriceChange[] | null | undefined
): boolean {
  if (parsePrice(ccsTeamPrice) != null) return true;
  return normalizePriceChanges(teamChanges).length > 0;
}

/**
 * Resolve public or CCS team effective price for a workshop (or any event with schedules).
 * Team: if team pricing configured → team schedule; else public schedule.
 */
export function resolveSignupListPrice(
  event: WorkshopPricingInput,
  opts: { isCcsTeam: boolean; asOfDateYmd?: string }
): number {
  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  const asOf = opts.asOfDateYmd || getTodayStringInTimeZone(tz);
  const publicPrice = getEffectiveWorkshopPrice(
    event.price,
    event.price_changes,
    asOf
  );

  if (!opts.isCcsTeam) return publicPrice;

  if (!isTeamPricingConfigured(event.ccs_team_price, event.ccs_team_price_changes)) {
    return publicPrice;
  }

  return getEffectiveWorkshopPrice(
    event.ccs_team_price,
    event.ccs_team_price_changes,
    asOf
  );
}

/** Next price change date for the relevant schedule (public or team). */
export function resolveNextPriceChangeDate(
  event: WorkshopPricingInput,
  opts: { isCcsTeam: boolean; asOfDateYmd?: string }
): string | null {
  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  const asOf = opts.asOfDateYmd || getTodayStringInTimeZone(tz);

  if (opts.isCcsTeam && isTeamPricingConfigured(event.ccs_team_price, event.ccs_team_price_changes)) {
    return getNextPriceChangeDate(event.ccs_team_price_changes, asOf);
  }
  return getNextPriceChangeDate(event.price_changes, asOf);
}

/** Effective-tier prices for Paid modal (public or team schedule). */
export function resolvePaidAmountOptions(
  event: WorkshopPricingInput,
  opts: { isCcsTeam: boolean; asOfDateYmd?: string }
): number[] {
  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  const asOf = opts.asOfDateYmd || getTodayStringInTimeZone(tz);

  if (opts.isCcsTeam && isTeamPricingConfigured(event.ccs_team_price, event.ccs_team_price_changes)) {
    return listEffectiveSchedulePrices(event.ccs_team_price, event.ccs_team_price_changes, asOf);
  }
  return listEffectiveSchedulePrices(event.price, event.price_changes, asOf);
}

/** Whether a schedule tier date is already in effect (locked in admin). */
export function isPriceChangeLocked(
  effectiveDate: string,
  timeZone?: string | null
): boolean {
  const today = getTodayStringInTimeZone(timeZone);
  return !!effectiveDate && effectiveDate <= today;
}

/** Format YYYY-MM-DD for display in emails/UI. */
export function formatPriceChangeDateLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** Parse price_changes from a DB/API event row. */
export function parseEventPriceFields(row: Record<string, unknown> | null | undefined): {
  price: number;
  price_changes: PriceChange[];
  ccs_team_price: number | null;
  ccs_team_price_changes: PriceChange[];
  time_zone: string;
} {
  return {
    price: parsePrice(row?.price) ?? 0,
    price_changes: normalizePriceChanges(row?.price_changes),
    ccs_team_price: parsePrice(row?.ccs_team_price),
    ccs_team_price_changes: normalizePriceChanges(row?.ccs_team_price_changes),
    time_zone:
      typeof row?.time_zone === "string" && row.time_zone.trim()
        ? row.time_zone.trim()
        : DEFAULT_TIME_ZONE,
  };
}

/** As-of date string for an event from "now" in its time zone. */
export function asOfDateForEvent(timeZone?: string | null): string {
  return getTodayStringInTimeZone(timeZone);
}

/**
 * Due now for a signup: desk override (amount_due) if set, else schedule list price.
 * amount_owed stays as Registered at and is not used here.
 */
export function resolveDueNowForSignup(
  event: WorkshopPricingInput | null | undefined,
  signup: {
    amount_due?: number | null;
    amount_owed?: number | null;
    is_ccs_team?: boolean | null;
    payment_method?: string | null;
  }
): number {
  const dueOverride = parsePrice(signup.amount_due);
  if (dueOverride != null) return dueOverride;

  if (event) {
    const pm = (signup.payment_method || "").toLowerCase().trim();
    return resolveSignupListPrice(event, {
      isCcsTeam: signup.is_ccs_team === true || pm === "ccs team",
    });
  }

  return parsePrice(signup.amount_owed) ?? 0;
}

/** Helper for display components that previously used event-day checks. */
export function getDisplayPriceForEvent(
  event: WorkshopPricingInput & { starts_at?: string | null },
  opts?: { isCcsTeam?: boolean }
): number | null {
  const base = parsePrice(event.price);
  if (base == null && !isTeamPricingConfigured(event.ccs_team_price, event.ccs_team_price_changes)) {
    return null;
  }
  return resolveSignupListPrice(event, { isCcsTeam: !!opts?.isCcsTeam });
}

export function eventDateYmd(
  startsAt: string | null | undefined,
  timeZone?: string | null
): string {
  if (!startsAt) return "";
  return getDateStringInTimeZone(startsAt, timeZone || DEFAULT_TIME_ZONE);
}
