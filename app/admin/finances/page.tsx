"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";
import Link from "next/link";
import { computeNashvillePayouts } from "@/lib/utils/nashvillePayouts";

const NASHVILLE_EVENT_TITLE = "Nashville Country Swing Nights!";
const NASHVILLE_EVENT_TITLE_NORMALIZED = normalizeEventTitle(NASHVILLE_EVENT_TITLE);

function normalizeEventTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function isNashvilleNightTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return normalizeEventTitle(title) === NASHVILLE_EVENT_TITLE_NORMALIZED;
}

interface NashvilleFinances {
  id: string;
  event_id: string;
  venue_cost: number;
  cash_override: number | null;
  stripe_override: number | null;
  bt1_name: string;
  bt1_payout_override: number | null;
  bt1_paid: boolean;
  bt1_paid_at: string | null;
  bt2_name: string;
  bt2_payout_override: number | null;
  bt2_paid: boolean;
  bt2_paid_at: string | null;
  bt3_name?: string | null;
  bt3_payout_override?: number | null;
  bt3_paid?: boolean;
  bt3_paid_at?: string | null;
  bt4_name?: string | null;
  bt4_payout_override?: number | null;
  bt4_paid?: boolean;
  bt4_paid_at?: string | null;
  upper_level_teacher_name: string;
  upper_level_payout_override: number | null;
  upper_level_paid: boolean;
  upper_level_paid_at: string | null;
  updated_at: string;
}

interface WorkshopFinances {
  id: string;
  event_id: string;
  studio_cost: number;
  total_override: number | null;
  guest_instructor_amount: number | null;
  ccs_amount: number | null;
  updated_at: string;
}

interface CompJudgePayout {
  id: string;
  judge_name: string;
  amount_paid: number;
  paid?: boolean;
  paid_at?: string | null;
}

/** Payload for PATCH judges: id is optional (new judges have no id until saved). */
interface CompJudgePayoutInput {
  id?: string;
  judge_name: string;
  amount_paid: number;
}

interface CompFinances {
  studio_cost: number;
  judges: CompJudgePayout[];
}

type EventsView = "upcoming" | "past" | "overview";

interface Event {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  price: number | null;
  ccs_team_price?: number | null;
  type?: string;
}

interface Signup {
  id: string;
  event_id: string;
  payment_method: string;
  paid: boolean;
  checked_in: boolean;
  is_ccs_team?: boolean;
  amount_owed?: number | null;
  stripe_tax_amount?: number | null;
  stripe_processing_fee?: number | null;
  free_via_promotion_code?: boolean;
  used_promotion_code?: boolean;
}

interface CompSignup {
  id: string;
  event_id: string;
  payment_method: string;
  paid: boolean;
  checked_in?: boolean;
  is_ccs_team?: boolean;
  amount_owed: number;
  stripe_tax_amount?: number | null;
  stripe_processing_fee?: number | null;
}

interface EventFinanceMetrics {
  event_id: string;
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
  refreshed_at: string;
}

function computeStats(
  signups: Signup[],
  eventPrice: number | null,
  eventCcsTeamPrice: number | null | undefined
): {
  totalSignups: number;
  checkedIn: number;
  cashTotal: number;
  stripeTotal: number;
  otherTotal: number;
  ccsTeamCashTotal: number;
  ccsTeamStripeTotal: number;
  ccsTeamTotal: number;
  stripeTaxesFees: number;
  freeViaPromoCount: number;
  revenueFromCoupons: number;
} {
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
    const freeViaPromo = s.free_via_promotion_code === true;
    const usedPromo = s.used_promotion_code === true;

    if (freeViaPromo) freeViaPromoCount += 1;

    if (isCcsTeam) {
      // CCS TEAM: always use event ccs_team_price; split by payment method (Cash vs Stripe)
      const amount = ccsTeamPrice;
      if (pm === "cash" && s.checked_in) {
        ccsTeamCashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "stripe" && s.paid) {
        ccsTeamStripeTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "ccs team" && s.checked_in) {
        ccsTeamCashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      }
    } else {
      // Free-via-promo: attendance only, no revenue
      if (freeViaPromo) continue;
      // Per-signup amount (e.g. discount); fallback to event price
      const amount = s.amount_owed != null ? Number(s.amount_owed) : price;
      if (pm === "cash" && s.checked_in) {
        cashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "stripe" && s.paid) {
        stripeTotal += amount;
        stripeTaxesFees += (s.stripe_tax_amount ?? 0) + (s.stripe_processing_fee ?? 0);
        if (usedPromo) revenueFromCoupons += amount;
      } else if (s.checked_in) {
        otherTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      }
    }
  }

  return {
    totalSignups: signups.length,
    checkedIn: signups.filter((s) => s.checked_in).length,
    cashTotal,
    stripeTotal,
    otherTotal,
    ccsTeamCashTotal,
    ccsTeamStripeTotal,
    ccsTeamTotal: ccsTeamCashTotal + ccsTeamStripeTotal,
    stripeTaxesFees,
    freeViaPromoCount,
    revenueFromCoupons,
  };
}

function computeStatsComp(
  compSignups: CompSignup[]
): {
  totalSignups: number;
  checkedIn: number;
  cashTotal: number;
  stripeTotal: number;
  otherTotal: number;
  ccsTeamCashTotal: number;
  ccsTeamStripeTotal: number;
  ccsTeamTotal: number;
  stripeTaxesFees: number;
  freeViaPromoCount: number;
  revenueFromCoupons: number;
} {
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
    if (isCcsTeam) {
      if (pm === "cash" && s.checked_in) ccsTeamCashTotal += amount;
      else if (pm === "stripe" && s.paid) ccsTeamStripeTotal += amount;
    } else {
      if (pm === "cash" && s.checked_in) cashTotal += amount;
      else if (pm === "stripe" && s.paid) {
        stripeTotal += amount;
        stripeTaxesFees += (s.stripe_tax_amount ?? 0) + (s.stripe_processing_fee ?? 0);
      } else if (s.checked_in) otherTotal += amount;
    }
  }

  return {
    totalSignups: compSignups.length,
    checkedIn: compSignups.filter((s) => s.checked_in).length,
    cashTotal,
    stripeTotal,
    otherTotal,
    ccsTeamCashTotal,
    ccsTeamStripeTotal,
    ccsTeamTotal: ccsTeamCashTotal + ccsTeamStripeTotal,
    stripeTaxesFees,
    freeViaPromoCount: 0,
    revenueFromCoupons: 0,
  };
}

function aggregateStats(
  eventStats: { totalSignups: number; checkedIn: number; cashTotal: number; stripeTotal: number; otherTotal: number; ccsTeamCashTotal: number; ccsTeamStripeTotal: number; ccsTeamTotal: number; stripeTaxesFees: number; freeViaPromoCount: number; revenueFromCoupons: number }[]
): {
  totalSignups: number;
  checkedIn: number;
  cashTotal: number;
  stripeTotal: number;
  otherTotal: number;
  ccsTeamCashTotal: number;
  ccsTeamStripeTotal: number;
  ccsTeamTotal: number;
  stripeTaxesFees: number;
  freeViaPromoCount: number;
  revenueFromCoupons: number;
} {
  return eventStats.reduce(
    (acc, s) => ({
      totalSignups: acc.totalSignups + s.totalSignups,
      checkedIn: acc.checkedIn + s.checkedIn,
      cashTotal: acc.cashTotal + s.cashTotal,
      stripeTotal: acc.stripeTotal + s.stripeTotal,
      otherTotal: acc.otherTotal + (s.otherTotal ?? 0),
      ccsTeamCashTotal: acc.ccsTeamCashTotal + (s.ccsTeamCashTotal ?? 0),
      ccsTeamStripeTotal: acc.ccsTeamStripeTotal + (s.ccsTeamStripeTotal ?? 0),
      ccsTeamTotal: acc.ccsTeamTotal + (s.ccsTeamTotal ?? 0),
      stripeTaxesFees: acc.stripeTaxesFees + s.stripeTaxesFees,
      freeViaPromoCount: acc.freeViaPromoCount + (s.freeViaPromoCount ?? 0),
      revenueFromCoupons: acc.revenueFromCoupons + (s.revenueFromCoupons ?? 0),
    }),
    { totalSignups: 0, checkedIn: 0, cashTotal: 0, stripeTotal: 0, otherTotal: 0, ccsTeamCashTotal: 0, ccsTeamStripeTotal: 0, ccsTeamTotal: 0, stripeTaxesFees: 0, freeViaPromoCount: 0, revenueFromCoupons: 0 }
  );
}

export default function AdminFinancesPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsView, setEventsView] = useState<EventsView>("upcoming");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [compSignups, setCompSignups] = useState<CompSignup[]>([]);
  const [isCompEvent, setIsCompEvent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [refreshingEventMetrics, setRefreshingEventMetrics] = useState(false);
  const [eventMetrics, setEventMetrics] = useState<EventFinanceMetrics | null>(null);
  const [overviewStats, setOverviewStats] = useState<{
    totalSignups: number;
    checkedIn: number;
    cashTotal: number;
    stripeTotal: number;
    otherTotal: number;
    ccsTeamCashTotal: number;
    ccsTeamStripeTotal: number;
    ccsTeamTotal: number;
    stripeTaxesFees: number;
    freeViaPromoCount: number;
    revenueFromCoupons: number;
  } | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewFinances, setOverviewFinances] = useState<{
    totalStudioRentals: number;
    totalPaidMalissa: number;
    totalPaidBt1: number;
    totalPaidBt2: number;
    totalPaidBt3: number;
    totalPaidBt4: number;
    totalPaidJudges: number;
    workshopCcsIncome: number;
    totalStripeTaxesFeesFromMerch: number;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [nashvilleFinances, setNashvilleFinances] = useState<NashvilleFinances | null>(null);
  const [loadingNashville, setLoadingNashville] = useState(false);
  const [nashvilleError, setNashvilleError] = useState<string | null>(null);
  const [nashvilleSaving, setNashvilleSaving] = useState(false);
  const [nashvilleCashInput, setNashvilleCashInput] = useState("");
  const [nashvilleStripeInput, setNashvilleStripeInput] = useState("");
  const [workshopFinances, setWorkshopFinances] = useState<WorkshopFinances | null>(null);
  const [loadingWorkshop, setLoadingWorkshop] = useState(false);
  const [workshopError, setWorkshopError] = useState<string | null>(null);
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [compFinances, setCompFinances] = useState<CompFinances | null>(null);
  const [loadingCompFinances, setLoadingCompFinances] = useState(false);
  const [compFinancesError, setCompFinancesError] = useState<string | null>(null);
  const [compFinancesSaving, setCompFinancesSaving] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    const t = dayjs().startOf("day");
    if (eventsView === "upcoming") {
      return events
        .filter((e) => dayjs(e.starts_at).isSame(t, "day") || dayjs(e.starts_at).isAfter(t, "day"))
        .sort((a, b) => {
          const da = dayjs(a.starts_at);
          const db = dayjs(b.starts_at);
          return da.isBefore(db) ? -1 : da.isAfter(db) ? 1 : 0;
        });
    }
    if (eventsView === "past") {
      return events
        .filter((e) => dayjs(e.starts_at).isBefore(t, "day"))
        .sort((a, b) => {
          const da = dayjs(a.starts_at);
          const db = dayjs(b.starts_at);
          return da.isAfter(db) ? -1 : da.isBefore(db) ? 1 : 0;
        });
    }
    return [];
  }, [events, eventsView]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const e of events) {
      set.add(dayjs(e.starts_at).year());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [events]);

  const eventCountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of events) {
      const y = dayjs(e.starts_at).year();
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const eventsInSelectedYear = useMemo(() => {
    if (selectedYear == null) return [];
    return events
      .filter((e) => dayjs(e.starts_at).year() === selectedYear)
        .sort((a, b) => {
          const da = dayjs(a.starts_at);
          const db = dayjs(b.starts_at);
        return da.isBefore(db) ? -1 : da.isAfter(db) ? 1 : 0;
      });
  }, [events, selectedYear]);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setIsAdmin(false);
        setAuthToken(null);
        return;
      }
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          setIsAdmin(false);
          setAuthToken(null);
          return;
        }
        const data = await res.json();
        const roleLower = (data.profile?.role || "").toLowerCase();
        const admin = roleLower === "admin";
        setIsAdmin(admin);
        setAuthToken(admin ? session.access_token : null);
      } catch {
        setIsAdmin(false);
        setAuthToken(null);
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabaseBrowser
        .from("events")
        .select("id, title, starts_at, location, price, ccs_team_price, type")
        .order("starts_at", { ascending: false });

      if (e) {
        setError("Failed to load events.");
        setEvents([]);
      } else {
        setEvents((data as Event[]) || []);
      }
      setLoading(false);
    };

    loadEvents();
  }, [isAdmin]);

  useEffect(() => {
    if (eventsView === "overview") {
      if (!years.length) {
        setSelectedYear(null);
        return;
      }
      const ok = selectedYear != null && years.includes(selectedYear);
      if (!ok) setSelectedYear(years[0]);
      return;
    }
    if (!filteredEvents.length) {
      setSelectedEvent(null);
      return;
    }
    const stillInList = selectedEvent && filteredEvents.some((e) => e.id === selectedEvent.id);
    if (!stillInList) setSelectedEvent(filteredEvents[0]);
  }, [eventsView, filteredEvents, years, selectedYear, selectedEvent?.id]);

  useEffect(() => {
    if (!isAdmin || eventsView === "overview" || !selectedEvent) {
      setSignups([]);
      setCompSignups([]);
      setIsCompEvent(false);
      setSignupsError(null);
      setEventMetrics(null);
      return;
    }

    const loadMetrics = async () => {
      setLoadingSignups(true);
      setSignupsError(null);
      try {
        if (!authToken) {
          setSignups([]);
          setCompSignups([]);
          setIsCompEvent(false);
          setEventMetrics(null);
          setSignupsError("Session expired. Please sign in again.");
          setLoadingSignups(false);
          return;
        }

        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const res = await fetch(`/api/admin/finance-metrics?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            (body as { error?: string })?.error ||
            (res.status === 401
              ? "Session expired. Please sign in again."
              : res.status === 403
                ? "You don’t have permission to view finance metrics."
                : "Failed to load finance metrics. Check your connection and try again.");
          setSignupsError(msg);
          setEventMetrics(null);
        } else {
          const json = await res.json();
          const metrics = (json.data ?? null) as EventFinanceMetrics | null;
          setEventMetrics(metrics);
          const isComp = !!metrics?.is_comp_event || (selectedEvent.type || "").toLowerCase() === "comp";
          setIsCompEvent(isComp);
        }
      } catch (e) {
        setSignupsError(
          "Connection failed. Check your network and try again."
        );
        setEventMetrics(null);
      } finally {
        setLoadingSignups(false);
      }
    };

    loadMetrics();
  }, [isAdmin, eventsView, selectedEvent, authToken]);

  const refreshEventMetrics = useCallback(async () => {
    if (!selectedEvent || !authToken) return;
    setRefreshingEventMetrics(true);
    setSignupsError(null);
    try {
      const res = await fetch("/api/admin/finance-metrics", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ event_id: selectedEvent.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string })?.error || "Failed to refresh finance metrics");
      }
      const { data } = await res.json();
      const metrics = (data ?? null) as EventFinanceMetrics | null;
      setEventMetrics(metrics);
      if (metrics) {
        setIsCompEvent(!!metrics.is_comp_event);
      }
    } catch (e) {
      setSignupsError(e instanceof Error ? e.message : "Failed to refresh finance metrics");
    } finally {
      setRefreshingEventMetrics(false);
    }
  }, [selectedEvent, authToken]);

  useEffect(() => {
    if (!isAdmin || eventsView !== "overview" || selectedYear == null || !eventsInSelectedYear.length) {
      setOverviewStats(null);
      setOverviewFinances(null);
      setOverviewError(null);
      return;
    }

    const loadOverview = async () => {
      setLoadingOverview(true);
      setOverviewError(null);
      try {
        if (!authToken) {
          setOverviewError("Session expired. Please sign in again.");
          setOverviewStats(null);
          setOverviewFinances(null);
          setLoadingOverview(false);
          return;
        }

        const isNashville = (ev: Event) => isNashvilleNightTitle(ev.title);
        const eventIds = eventsInSelectedYear.map((ev) => ev.id);

        const metricsRes = await fetch(
          `/api/admin/finance-metrics?event_ids=${encodeURIComponent(eventIds.join(","))}`,
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        if (!metricsRes.ok) {
          const body = await metricsRes.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string })?.error || "Failed to load finance metrics"
          );
        }
        const metricsJson = await metricsRes.json();
        const metricsRows: EventFinanceMetrics[] = Array.isArray(metricsJson.data)
          ? (metricsJson.data as EventFinanceMetrics[])
          : [];
        const metricsByEventId = new Map<string, EventFinanceMetrics>(
          metricsRows.map((m) => [m.event_id, m])
        );

        const results = await Promise.all(
          eventsInSelectedYear.map(async (ev) => {
            const m = metricsByEventId.get(ev.id);
            const isComp = !!m?.is_comp_event;
            const stats = {
              totalSignups: Number(m?.total_signups ?? 0),
              checkedIn: Number(m?.checked_in_count ?? 0),
              cashTotal: Number(m?.cash_total ?? 0),
              stripeTotal: Number(m?.stripe_total ?? 0),
              otherTotal: Number(m?.other_total ?? 0),
              ccsTeamCashTotal: Number(m?.ccs_team_cash_total ?? 0),
              ccsTeamStripeTotal: Number(m?.ccs_team_stripe_total ?? 0),
              ccsTeamTotal: Number(m?.ccs_team_total ?? 0),
              stripeTaxesFees: Number(m?.stripe_taxes_fees_total ?? 0),
              freeViaPromoCount: Number(m?.free_via_promo_count ?? 0),
              revenueFromCoupons: Number(m?.revenue_from_coupons ?? 0),
            };

            let nashvilleFinances: NashvilleFinances | null = null;
            let workshopFinances: WorkshopFinances | null = null;
            let compFinances: CompFinances | null = null;

            if (isNashville(ev)) {
              const nr = await fetch(`/api/admin/nashville-night-finances?event_id=${ev.id}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (nr.ok) {
                const { data } = await nr.json();
                nashvilleFinances = data ?? null;
              }
            }
            // Fetch workshop finances for every non-Nashville event so we include any event
            // that has a workshop_finances row (e.g. "Workshop by Juan Aguirre") even if
            // event.type is not set to "workshop".
            if (!isNashville(ev)) {
              const wr = await fetch(`/api/admin/workshop-finances?event_id=${ev.id}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (wr.ok) {
                const { data } = await wr.json();
                workshopFinances = data ?? null;
              }
            }
            if (isComp) {
              const cr = await fetch(`/api/admin/comp-finances?event_id=${ev.id}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (cr.ok) {
                const { data } = await cr.json();
                compFinances = data ?? null;
              }
            }

            return { stats, nashvilleFinances, workshopFinances, compFinances };
          })
        );

        setOverviewStats(aggregateStats(results.map((r) => r.stats)));

        let totalStudioRentals = 0;
        let totalPaidMalissa = 0;
        let totalPaidBt1 = 0;
        let totalPaidBt2 = 0;
        let totalPaidBt3 = 0;
        let totalPaidBt4 = 0;
        let totalPaidJudges = 0;
        let workshopCcsIncome = 0;

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const ev = eventsInSelectedYear[i];
          if (r.nashvilleFinances) {
            const nf = r.nashvilleFinances;
            const venueCost = Number(nf.venue_cost) || 0;
            totalStudioRentals += venueCost;
            const cash = r.stats.cashTotal;
            const stripe = r.stats.stripeTotal;
            const activeBtCount =
              nf.bt4_name != null && nf.bt4_name.trim() !== ""
                ? 4
                : nf.bt3_name != null && nf.bt3_name.trim() !== ""
                  ? 3
                  : 2;
            const payouts = computeNashvillePayouts({
              cashTotal: cash,
              stripeTotal: stripe,
              venueCost,
              activeBtCount,
              bt1Override: nf.bt1_payout_override ?? null,
              bt2Override: nf.bt2_payout_override ?? null,
              bt3Override: nf.bt3_payout_override ?? null,
              bt4Override: nf.bt4_payout_override ?? null,
              malissaOverride: nf.upper_level_payout_override ?? null,
            });
            totalPaidMalissa += payouts.malissaPayout;
            totalPaidBt1 += payouts.bt1Payout;
            totalPaidBt2 += payouts.bt2Payout;
            totalPaidBt3 += payouts.bt3Payout;
            totalPaidBt4 += payouts.bt4Payout;
          }
          if (r.workshopFinances) {
            totalStudioRentals += Number(r.workshopFinances.studio_cost) || 0;
            workshopCcsIncome += Number(r.workshopFinances.ccs_amount) || 0;
          }
          if (r.compFinances) {
            totalStudioRentals += Number(r.compFinances.studio_cost) || 0;
            for (const j of r.compFinances.judges ?? []) {
              totalPaidJudges += Number(j.amount_paid) || 0;
            }
          }
        }

        // Stripe taxes/fees from merch orders (paid via Stripe) in this year
        let totalStripeTaxesFeesFromMerch = 0;
        try {
          const yearStart = `${selectedYear}-01-01T00:00:00.000Z`;
          const yearEnd = `${selectedYear}-12-31T23:59:59.999Z`;
          const { data: merchOrders } = await supabaseBrowser
            .from("merch_orders")
            .select("stripe_tax_amount, stripe_processing_fee")
            .eq("paid", true)
            .eq("payment_method", "stripe")
            .gte("created_at", yearStart)
            .lte("created_at", yearEnd);
          if (merchOrders?.length) {
            totalStripeTaxesFeesFromMerch = merchOrders.reduce(
              (sum, o) => sum + (Number(o.stripe_tax_amount) || 0) + (Number(o.stripe_processing_fee) || 0),
              0
            );
          }
          totalStripeTaxesFeesFromMerch = Math.round(totalStripeTaxesFeesFromMerch * 100) / 100;
        } catch {
          // Columns may not exist yet or RLS may block; use 0
        }

        setOverviewFinances({
          totalStudioRentals: Math.round(totalStudioRentals * 100) / 100,
          totalPaidMalissa: Math.round(totalPaidMalissa * 100) / 100,
          totalPaidBt1: Math.round(totalPaidBt1 * 100) / 100,
          totalPaidBt2: Math.round(totalPaidBt2 * 100) / 100,
          totalPaidBt3: Math.round(totalPaidBt3 * 100) / 100,
          totalPaidBt4: Math.round(totalPaidBt4 * 100) / 100,
          totalPaidJudges: Math.round(totalPaidJudges * 100) / 100,
          workshopCcsIncome: Math.round(workshopCcsIncome * 100) / 100,
          totalStripeTaxesFeesFromMerch,
        });
      } catch (e) {
        setOverviewError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setOverviewStats(null);
        setOverviewFinances(null);
      } finally {
        setLoadingOverview(false);
      }
    };

    loadOverview();
  }, [isAdmin, eventsView, selectedYear, eventsInSelectedYear]);

  const isNashvilleEvent = isNashvilleNightTitle(selectedEvent?.title);
  const isWorkshopEvent = (selectedEvent?.type ?? "").toLowerCase() === "workshop";

  useEffect(() => {
    if (
      !isAdmin ||
      eventsView === "overview" ||
      !selectedEvent ||
      !isNashvilleEvent
    ) {
      setNashvilleFinances(null);
      setNashvilleError(null);
      return;
    }

    const load = async () => {
      setLoadingNashville(true);
      setNashvilleError(null);
      try {
        if (!authToken) {
          setNashvilleError("Session expired. Please sign in again.");
          setNashvilleFinances(null);
          setLoadingNashville(false);
          return;
        }
        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const res = await fetch(`/api/admin/nashville-night-finances?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setNashvilleError(
            (body as { error?: string })?.error || "Failed to load Nashville finances"
          );
          setNashvilleFinances(null);
        } else {
          const { data } = await res.json();
          setNashvilleFinances(data ?? null);
        }
      } catch (e) {
        setNashvilleError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setNashvilleFinances(null);
      } finally {
        setLoadingNashville(false);
      }
    };

    load();
  }, [isAdmin, eventsView, selectedEvent?.id, isNashvilleEvent, authToken]);

  useEffect(() => {
    if (
      !isAdmin ||
      eventsView === "overview" ||
      !selectedEvent ||
      !isWorkshopEvent ||
      isNashvilleEvent
    ) {
      setWorkshopFinances(null);
      setWorkshopError(null);
      return;
    }

    const load = async () => {
      setLoadingWorkshop(true);
      setWorkshopError(null);
      try {
        if (!authToken) {
          setWorkshopError("Session expired. Please sign in again.");
          setWorkshopFinances(null);
          setLoadingWorkshop(false);
          return;
        }
        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const res = await fetch(`/api/admin/workshop-finances?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setWorkshopError(
            (body as { error?: string })?.error || "Failed to load workshop finances"
          );
          setWorkshopFinances(null);
        } else {
          const { data } = await res.json();
          setWorkshopFinances(data ?? null);
        }
      } catch (e) {
        setWorkshopError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setWorkshopFinances(null);
      } finally {
        setLoadingWorkshop(false);
      }
    };

    load();
  }, [isAdmin, eventsView, selectedEvent?.id, isWorkshopEvent, isNashvilleEvent]);

  useEffect(() => {
    if (
      !isAdmin ||
      eventsView === "overview" ||
      !selectedEvent ||
      !isCompEvent
    ) {
      setCompFinances(null);
      setCompFinancesError(null);
      return;
    }

    const load = async () => {
      setLoadingCompFinances(true);
      setCompFinancesError(null);
      try {
        if (!authToken) {
          setCompFinancesError("Session expired. Please sign in again.");
          setCompFinances(null);
          setLoadingCompFinances(false);
          return;
        }
        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const res = await fetch(`/api/admin/comp-finances?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setCompFinancesError(
            (body as { error?: string })?.error || "Failed to load comp finances"
          );
          setCompFinances(null);
        } else {
          const { data } = await res.json();
          setCompFinances(data ?? null);
        }
      } catch (e) {
        setCompFinancesError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setCompFinances(null);
      } finally {
        setLoadingCompFinances(false);
      }
    };

    load();
  }, [isAdmin, eventsView, selectedEvent?.id, isCompEvent]);

  const patchCompFinances = useCallback(
    async (updates: { studio_cost?: number; judges?: CompJudgePayoutInput[]; mark_judge_paid?: string }) => {
      if (!selectedEvent || !isCompEvent || !authToken) return;
      setCompFinancesSaving(true);
      try {
        const res = await fetch("/api/admin/comp-finances", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            event_id: selectedEvent.id,
            ...updates,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to save");
        }
        const { data } = await res.json();
        setCompFinances(data);
      } catch (e) {
        console.error("Comp finances PATCH:", e);
        setCompFinancesError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setCompFinancesSaving(false);
      }
    },
    [selectedEvent?.id, isCompEvent, authToken]
  );

  const patchWorkshop = useCallback(
    async (updates: {
      studio_cost?: number;
      total_override?: number | null;
      guest_instructor_amount?: number | null;
      ccs_amount?: number | null;
    }) => {
      if (!selectedEvent || !isWorkshopEvent || !authToken) return;
      setWorkshopSaving(true);
      try {
        const res = await fetch("/api/admin/workshop-finances", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            event_id: selectedEvent.id,
            ...updates,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to save");
        }
        const { data } = await res.json();
        setWorkshopFinances(data);
      } catch (e) {
        console.error("Workshop PATCH:", e);
        setWorkshopError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setWorkshopSaving(false);
      }
    },
    [selectedEvent?.id, isWorkshopEvent, authToken]
  );

  const patchNashville = useCallback(
    async (updates: {
      venue_cost?: number;
      cash_override?: number | null;
      stripe_override?: number | null;
      bt1_name?: string;
      bt2_name?: string;
      bt3_name?: string | null;
      bt4_name?: string | null;
      upper_level_teacher_name?: string;
      bt1_payout_override?: number | null;
      bt2_payout_override?: number | null;
      bt3_payout_override?: number | null;
      bt4_payout_override?: number | null;
      upper_level_payout_override?: number | null;
      mark_bt1_paid?: boolean;
      mark_bt2_paid?: boolean;
      mark_bt3_paid?: boolean;
      mark_bt4_paid?: boolean;
      mark_upper_level_paid?: boolean;
    }) => {
      if (!selectedEvent || !isNashvilleEvent || !authToken) return;
      setNashvilleSaving(true);
      try {
        const res = await fetch("/api/admin/nashville-night-finances", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            event_id: selectedEvent.id,
            ...updates,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to save");
        }
        const { data } = await res.json();
        setNashvilleFinances(data);
      } catch (e) {
        console.error("Nashville PATCH:", e);
        setNashvilleError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setNashvilleSaving(false);
      }
    },
    [selectedEvent?.id, isNashvilleEvent, authToken]
  );

  const stats =
    eventsView === "overview" && overviewStats
      ? overviewStats
      : eventMetrics
        ? {
            totalSignups: eventMetrics.total_signups,
            checkedIn: eventMetrics.checked_in_count,
            cashTotal: Number(eventMetrics.cash_total) || 0,
            stripeTotal: Number(eventMetrics.stripe_total) || 0,
            otherTotal: Number(eventMetrics.other_total) || 0,
            ccsTeamCashTotal: Number(eventMetrics.ccs_team_cash_total) || 0,
            ccsTeamStripeTotal: Number(eventMetrics.ccs_team_stripe_total) || 0,
            ccsTeamTotal: Number(eventMetrics.ccs_team_total) || 0,
            stripeTaxesFees: Number(eventMetrics.stripe_taxes_fees_total) || 0,
            freeViaPromoCount: Number(eventMetrics.free_via_promo_count) || 0,
            revenueFromCoupons: Number(eventMetrics.revenue_from_coupons) || 0,
          }
        : isCompEvent
          ? computeStatsComp(compSignups)
          : computeStats(signups, selectedEvent?.price ?? null, selectedEvent?.ccs_team_price ?? null);

  const stripeTaxesFees = stats.stripeTaxesFees ?? 0;

  const effectiveCash = isNashvilleEvent && nashvilleFinances?.cash_override != null
    ? nashvilleFinances.cash_override
    : stats.cashTotal;
  const effectiveStripe = isNashvilleEvent && nashvilleFinances?.stripe_override != null
    ? nashvilleFinances.stripe_override
    : stats.stripeTotal;

  useEffect(() => {
    if (isNashvilleEvent) {
      setNashvilleCashInput(String(effectiveCash));
      setNashvilleStripeInput(String(effectiveStripe));
    }
  }, [isNashvilleEvent, effectiveCash, effectiveStripe]);

  const saveNashvilleCash = useCallback(() => {
    const v = parseFloat(nashvilleCashInput);
    if (!Number.isNaN(v) && v >= 0 && (selectedEvent != null) && isNashvilleEvent) {
      patchNashville({ cash_override: v });
    }
  }, [nashvilleCashInput, selectedEvent, isNashvilleEvent, patchNashville]);

  const saveNashvilleStripe = useCallback(() => {
    const v = parseFloat(nashvilleStripeInput);
    if (!Number.isNaN(v) && selectedEvent != null && isNashvilleEvent) {
      patchNashville({ stripe_override: v });
    }
  }, [nashvilleStripeInput, selectedEvent, isNashvilleEvent, patchNashville]);

  if (isAdmin === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-neutral-400">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">
          Access denied
        </h1>
        <p className="mb-6 text-neutral-400">
          This page is for administrators only.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-primary px-4 py-2 font-medium text-black transition hover:bg-primary/90"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            Event finances
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Admin-only • High-level signup and revenue by event
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/users"
            className="text-sm text-neutral-400 transition hover:text-primary"
          >
            User roles
          </Link>
          <Link
            href="/"
            className="text-sm text-neutral-400 transition hover:text-primary"
          >
            ← Back to site
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-primary">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800/30">
          <p className="text-neutral-400">Loading events…</p>
        </div>
      ) : !events.length ? (
        <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-8 text-center text-neutral-400">
          No events found.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-2">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              {eventsView === "overview" ? "Year" : "Events"}
            </p>
            <div
              role="group"
              aria-label="Upcoming, past, or overview by year"
              className="mb-3 flex rounded-lg border border-primary/40 bg-neutral-900/80 p-0.5 ring-1 ring-primary/20"
            >
              <button
                type="button"
                onClick={() => setEventsView("upcoming")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                  eventsView === "upcoming"
                    ? "bg-[#F2C94C] text-black shadow-[0_0_10px_rgba(242,201,76,0.35)]"
                    : "text-primary/70 hover:bg-primary/15 hover:text-primary"
                }`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setEventsView("past")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                  eventsView === "past"
                    ? "bg-[#F2C94C] text-black shadow-[0_0_10px_rgba(242,201,76,0.35)]"
                    : "text-primary/70 hover:bg-primary/15 hover:text-primary"
                }`}
              >
                Past
              </button>
              <button
                type="button"
                onClick={() => setEventsView("overview")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                  eventsView === "overview"
                    ? "bg-[#F2C94C] text-black shadow-[0_0_10px_rgba(242,201,76,0.35)]"
                    : "text-primary/70 hover:bg-primary/15 hover:text-primary"
                }`}
              >
                Overview
              </button>
            </div>
            {eventsView === "overview" ? (
              !years.length ? (
                <p className="px-2 py-4 text-center text-sm text-neutral-500">
                  No years with events
                </p>
              ) : (
                <div className="max-h-[380px] space-y-0.5 overflow-y-auto">
                  {years.map((y) => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(y)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        selectedYear === y
                          ? "bg-neutral-700 text-primary"
                          : "text-neutral-300 hover:bg-neutral-700/50 hover:text-white"
                      }`}
                    >
                      <div className="font-medium">{y}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {eventCountByYear.get(y) ?? 0} event
                        {(eventCountByYear.get(y) ?? 0) === 1 ? "" : "s"}
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : !filteredEvents.length ? (
              <p className="px-2 py-4 text-center text-sm text-neutral-500">
                {eventsView === "upcoming"
                  ? "No upcoming events"
                  : "No past events"}
              </p>
            ) : (
              <div className="max-h-[380px] space-y-0.5 overflow-y-auto">
                {filteredEvents.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      selectedEvent?.id === ev.id
                        ? "bg-neutral-700 text-primary"
                        : "text-neutral-300 hover:bg-neutral-700/50 hover:text-white"
                    }`}
                  >
                    <div className="font-medium truncate">{ev.title}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {dayjs(ev.starts_at).format("MMM D, YYYY")}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-6">
            {eventsView === "overview" ? (
              selectedYear == null ? (
                <p className="text-neutral-400">Select a year.</p>
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-white">
                      {selectedYear} overview
                    </h2>
                    <p className="text-sm text-neutral-500">
                      Totals across {eventsInSelectedYear.length} event
                      {eventsInSelectedYear.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {loadingOverview ? (
                    <div className="flex min-h-[180px] items-center justify-center text-neutral-400">
                      Loading…
                    </div>
                  ) : overviewError ? (
                    <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
                      <p className="font-medium">{overviewError}</p>
                      <p className="mt-2 text-sm text-neutral-400">
                        Make sure you're signed in as an admin and your session
                        is valid. You can{" "}
                        <Link href="/auth" className="underline hover:no-underline">
                          sign in again
                        </Link>{" "}
                        or go back to the site and retry.
                      </p>
                    </div>
                  ) : overviewStats ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Signed up
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            {overviewStats.totalSignups}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            total registrations
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Checked in
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            {overviewStats.checkedIn}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            attended
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Free (discount code)
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            {(overviewStats.freeViaPromoCount ?? 0)}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            registered with a promo that made the class free
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Cash
                          </p>
                          <p className="mt-1 text-2xl font-bold text-primary">
                            ${overviewStats.cashTotal.toFixed(2)}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            Cash + checked in
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Stripe
                          </p>
                          <p className="mt-1 text-2xl font-bold text-accent">
                            ${overviewStats.stripeTotal.toFixed(2)}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            paid via Stripe
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            CCS TEAM · Cash
                          </p>
                          <p className="mt-1 text-2xl font-bold text-yellow-400">
                            ${(overviewStats.ccsTeamCashTotal ?? 0).toFixed(2)}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            team price, paid cash
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            CCS TEAM · Stripe
                          </p>
                          <p className="mt-1 text-2xl font-bold text-yellow-400">
                            ${(overviewStats.ccsTeamStripeTotal ?? 0).toFixed(2)}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            team price, paid Stripe
                          </p>
                        </div>
                        {(overviewStats.otherTotal ?? 0) > 0 && (
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Other
                            </p>
                            <p className="mt-1 text-2xl font-bold text-neutral-300">
                              ${(overviewStats.otherTotal ?? 0).toFixed(2)}
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              other payment, checked in
                            </p>
                          </div>
                        )}
                        {(overviewStats.freeViaPromoCount ?? 0) > 0 && (
                          <div className="rounded-lg border border-green-800/50 bg-green-900/20 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Free (discount code)
                            </p>
                            <p className="mt-1 text-2xl font-bold text-green-400">
                              {(overviewStats.freeViaPromoCount ?? 0)}
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              registered with a discount code that made the class free; attendance only, not revenue
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-yellow-500/30 bg-neutral-800/30 px-4 py-3">
                        <span className="text-sm font-medium text-neutral-300">
                          CCS TEAM total
                        </span>
                        <span className="text-lg font-bold text-yellow-400">
                          ${(overviewStats.ccsTeamTotal ?? 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                            <span className="text-sm font-medium text-neutral-300">
                              Gross income (Cash + Stripe + Other + CCS TEAM)
                            </span>
                            <div className="flex flex-col gap-1">
                              <span className="text-lg font-bold text-primary">
                                $
                                {(overviewStats.cashTotal + overviewStats.stripeTotal + (overviewStats.otherTotal ?? 0) + (overviewStats.ccsTeamTotal ?? 0)).toFixed(2)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                Cash and Stripe totals above add up to this gross event revenue.
                              </span>
                              {(overviewStats.revenueFromCoupons ?? 0) > 0 && (
                                <div className="mt-2 pt-2 border-t border-neutral-600 flex items-center justify-between text-sm">
                                  <span className="text-neutral-400">Revenue from Coupons (included in total)</span>
                                  <span className="font-medium text-white">${(overviewStats.revenueFromCoupons ?? 0).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                      </div>

                      {/* Total Stripe taxes & fees (events, workshops, comps + merch) */}
                      {(overviewStats.stripeTaxesFees > 0 || (overviewFinances?.totalStripeTaxesFeesFromMerch ?? 0) > 0) && (
                        <div className="mt-6 rounded-lg border border-accent/30 bg-neutral-800/40 px-4 py-4">
                          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
                            Total Stripe taxes &amp; fees ({selectedYear})
                          </h3>
                          <p className="mb-3 text-xs text-neutral-500">
                            Taxes and processing fees collected via Stripe (to remain in bank).
                          </p>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between text-neutral-300">
                              <span>Events, workshops &amp; comps</span>
                              <span className="font-semibold text-white">
                                ${overviewStats.stripeTaxesFees.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-neutral-300">
                              <span>Merch sales</span>
                              <span className="font-semibold text-white">
                                ${(overviewFinances?.totalStripeTaxesFeesFromMerch ?? 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-2 border-t border-neutral-600 pt-2 flex items-center justify-between font-medium text-accent">
                              <span>Total</span>
                              <span>
                                ${(overviewStats.stripeTaxesFees + (overviewFinances?.totalStripeTaxesFeesFromMerch ?? 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {overviewFinances && (
                        <>
                          <h3 className="mt-8 mb-3 text-base font-semibold text-white">
                            Payouts &amp; expenses ({selectedYear})
                          </h3>
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Total paid · Upper Level Teacher
                              </p>
                              <p className="mt-1 text-xl font-bold text-primary">
                                ${overviewFinances.totalPaidMalissa.toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Total paid · Beginner Teacher 1
                              </p>
                              <p className="mt-1 text-xl font-bold text-primary">
                                ${overviewFinances.totalPaidBt1.toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Total paid · Beginner Teacher 2
                              </p>
                              <p className="mt-1 text-xl font-bold text-primary">
                                ${overviewFinances.totalPaidBt2.toFixed(2)}
                              </p>
                            </div>
                            {(overviewFinances.totalPaidBt3 > 0 || overviewFinances.totalPaidBt4 > 0) && (
                              <>
                                {overviewFinances.totalPaidBt3 > 0 && (
                                  <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                                    <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                      Total paid · Beginner Teacher 3
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-primary">
                                      ${overviewFinances.totalPaidBt3.toFixed(2)}
                                    </p>
                                  </div>
                                )}
                                {overviewFinances.totalPaidBt4 > 0 && (
                                  <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                                    <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                      Total paid · Beginner Teacher 4
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-primary">
                                      ${overviewFinances.totalPaidBt4.toFixed(2)}
                                    </p>
                                  </div>
                                )}
                              </>
                            )}
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Total paid · Judges
                              </p>
                              <p className="mt-1 text-xl font-bold text-accent">
                                ${overviewFinances.totalPaidJudges.toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 sm:col-span-2 lg:col-span-1">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Total studio rentals
                              </p>
                              <p className="mt-1 text-xl font-bold text-neutral-300">
                                ${overviewFinances.totalStudioRentals.toFixed(2)}
                              </p>
                              <p className="mt-0.5 text-xs text-neutral-500">
                                Across all event types (Nashville venue + workshops + comps)
                              </p>
                            </div>
                          </div>

                          <div className="mt-8 rounded-xl border border-primary/30 bg-neutral-800/50 p-6 ring-1 ring-primary/20">
                            <h3 className="mb-4 text-base font-semibold text-primary">
                              {selectedYear} year summary
                            </h3>
                            <div className="space-y-4 text-sm">
                              <div>
                                <p className="mb-2 font-medium uppercase tracking-wider text-neutral-500">
                                  Money in
                                </p>
                                <div className="space-y-1.5 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Event revenue (Cash + Stripe + Other + CCS TEAM)</span>
                                    <span className="font-semibold text-white">
                                      ${(overviewStats.cashTotal + overviewStats.stripeTotal + (overviewStats.otherTotal ?? 0) + (overviewStats.ccsTeamTotal ?? 0)).toFixed(2)}
                                    </span>
                                  </div>
                                  {(overviewStats.revenueFromCoupons ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-neutral-300">
                                      <span>Revenue from Coupons (included above)</span>
                                      <span className="font-semibold text-white">
                                        ${(overviewStats.revenueFromCoupons ?? 0).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Of which CCS from workshops (10%)</span>
                                    <span className="font-semibold text-primary">
                                      ${overviewFinances.workshopCcsIncome.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="my-2 border-t border-neutral-700" />
                                  <div className="flex items-center justify-between font-medium text-white">
                                    <span>Total money in</span>
                                    <span>
                                      ${(overviewStats.cashTotal + overviewStats.stripeTotal + (overviewStats.otherTotal ?? 0) + (overviewStats.ccsTeamTotal ?? 0)).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                                <p className="mt-1.5 text-xs text-neutral-500">
                                  CCS 10% from workshops is calculated from workshop revenue and included in the total above.
                                </p>
                              </div>
                              <div>
                                <p className="mb-2 font-medium uppercase tracking-wider text-neutral-500">
                                  Money out
                                </p>
                                <div className="space-y-1.5 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Studio rentals (all event types)</span>
                                    <span className="font-semibold text-white">
                                      −${overviewFinances.totalStudioRentals.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Upper Level Teacher</span>
                                    <span className="font-semibold text-white">
                                      −${overviewFinances.totalPaidMalissa.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Beginner Teacher 1</span>
                                    <span className="font-semibold text-white">
                                      −${overviewFinances.totalPaidBt1.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Beginner Teacher 2</span>
                                    <span className="font-semibold text-white">
                                      −${overviewFinances.totalPaidBt2.toFixed(2)}
                                    </span>
                                  </div>
                                  {overviewFinances.totalPaidBt3 > 0 && (
                                    <div className="flex items-center justify-between text-neutral-300">
                                      <span>Beginner Teacher 3</span>
                                      <span className="font-semibold text-white">
                                        −${overviewFinances.totalPaidBt3.toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {overviewFinances.totalPaidBt4 > 0 && (
                                    <div className="flex items-center justify-between text-neutral-300">
                                      <span>Beginner Teacher 4</span>
                                      <span className="font-semibold text-white">
                                        −${overviewFinances.totalPaidBt4.toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-neutral-300">
                                    <span>Judges</span>
                                    <span className="font-semibold text-white">
                                      −${overviewFinances.totalPaidJudges.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="my-2 border-t border-neutral-700" />
                                  <div className="flex items-center justify-between font-medium text-white">
                                    <span>Total money out</span>
                                    <span>
                                      −${(overviewFinances.totalStudioRentals + overviewFinances.totalPaidMalissa + overviewFinances.totalPaidBt1 + overviewFinances.totalPaidBt2 + overviewFinances.totalPaidBt3 + overviewFinances.totalPaidBt4 + overviewFinances.totalPaidJudges).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="rounded-lg border-2 border-primary/50 bg-primary/10 px-4 py-4">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-primary">Total income for the year</span>
                                  <span className="text-xl font-bold text-primary">
                                    $
                                    {(
                                      (overviewStats.cashTotal + overviewStats.stripeTotal + (overviewStats.otherTotal ?? 0) + (overviewStats.ccsTeamTotal ?? 0))
                                      - (overviewFinances.totalStudioRentals + overviewFinances.totalPaidMalissa + overviewFinances.totalPaidBt1 + overviewFinances.totalPaidBt2 + overviewFinances.totalPaidBt3 + overviewFinances.totalPaidBt4 + overviewFinances.totalPaidJudges)
                                    ).toFixed(2)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-neutral-500">
                                  Money in − Money out
                                </p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                </>
              )
            ) : !selectedEvent ? (
              <p className="text-neutral-400">Select an event.</p>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-white">
                    {selectedEvent.title}
                  </h2>
                  <p className="text-sm text-neutral-500">
                    {dayjs(selectedEvent.starts_at).format("dddd, MMMM D, YYYY")}
                    {selectedEvent.location
                      ? ` · ${selectedEvent.location}`
                      : ""}
                  </p>
                  {selectedEvent.price != null && (
                    <p className="mt-1 text-sm text-neutral-400">
                      Event price: ${Number(selectedEvent.price).toFixed(2)}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={refreshEventMetrics}
                      disabled={refreshingEventMetrics || !authToken}
                      className="rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {refreshingEventMetrics ? "Refreshing..." : "Refresh finance numbers"}
                    </button>
                    {eventMetrics?.refreshed_at && (
                      <p className="text-xs text-neutral-500">
                        Last refreshed: {dayjs(eventMetrics.refreshed_at).format("MMM D, YYYY h:mm A")}
                      </p>
                    )}
                  </div>
                </div>

                {loadingSignups ? (
                  <div className="flex min-h-[180px] items-center justify-center text-neutral-400">
                    Loading signups…
                  </div>
                ) : signupsError ? (
                  <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
                    <p className="font-medium">{signupsError}</p>
                    <p className="mt-2 text-sm text-neutral-400">
                      Make sure you’re signed in as an admin and your session is valid. You can{" "}
                      <Link href="/auth" className="underline hover:no-underline">
                        sign in again
                      </Link>{" "}
                      or retry refreshing this event.
                    </p>
                  </div>
                ) : (
                  <>
                    {!eventMetrics && (
                      <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-neutral-300">
                        No saved finance metrics yet for this event. Click{" "}
                        <span className="font-medium text-primary">Refresh finance numbers</span>{" "}
                        to compute and store them.
                      </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                          Signed up
                        </p>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {stats.totalSignups}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-400">
                          total registrations
                        </p>
                      </div>
                      <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                          Checked in
                        </p>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {stats.checkedIn}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-400">
                          attended
                        </p>
                      </div>
                      {(stats.freeViaPromoCount ?? 0) > 0 && (
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Free (discount code)
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            {stats.freeViaPromoCount}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            registered with a promo that made the class free
                          </p>
                        </div>
                      )}
                      {isNashvilleEvent ? (
                        <>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Cash
                            </p>
                            <div className="mt-1 flex items-baseline gap-1">
                              <span className="text-neutral-500">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={nashvilleCashInput}
                                onChange={(e) => setNashvilleCashInput(e.target.value)}
                                onBlur={saveNashvilleCash}
                                disabled={nashvilleSaving}
                                className="w-24 rounded border border-neutral-600 bg-neutral-800 text-xl font-bold text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                              />
                            </div>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              Editable • Cash + checked in
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Stripe
                            </p>
                            <div className="mt-1 flex items-baseline gap-1">
                              <span className="text-neutral-500">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={nashvilleStripeInput}
                                onChange={(e) => setNashvilleStripeInput(e.target.value)}
                                onBlur={saveNashvilleStripe}
                                disabled={nashvilleSaving}
                                className="w-24 rounded border border-neutral-600 bg-neutral-800 text-xl font-bold text-accent focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                              />
                            </div>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              Editable • paid via Stripe
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Cash
                            </p>
                            <p className="mt-1 text-2xl font-bold text-primary">
                              ${stats.cashTotal.toFixed(2)}
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              Cash + checked in
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Stripe
                            </p>
                            <p className="mt-1 text-2xl font-bold text-accent">
                              ${stats.stripeTotal.toFixed(2)}
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              paid via Stripe
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              CCS TEAM · Cash
                            </p>
                            <p className="mt-1 text-2xl font-bold text-yellow-400">
                              ${(stats.ccsTeamCashTotal ?? 0).toFixed(2)}
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              team price, paid cash
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              CCS TEAM · Stripe
                            </p>
                            <p className="mt-1 text-2xl font-bold text-yellow-400">
                              ${(stats.ccsTeamStripeTotal ?? 0).toFixed(2)}
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-400">
                              team price, paid Stripe
                            </p>
                          </div>
                          {(stats.otherTotal ?? 0) > 0 && (
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Other
                              </p>
                              <p className="mt-1 text-2xl font-bold text-neutral-300">
                                ${(stats.otherTotal ?? 0).toFixed(2)}
                              </p>
                              <p className="mt-0.5 text-sm text-neutral-400">
                                other payment, checked in
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-yellow-500/30 bg-neutral-800/30 px-4 py-3">
                      <span className="text-sm font-medium text-neutral-300">CCS TEAM total</span>
                      <span className="text-lg font-bold text-yellow-400">
                        ${(stats.ccsTeamTotal ?? 0).toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                      <span className="text-sm font-medium text-neutral-300">
                        Combined total (Cash + Stripe + Other + CCS TEAM)
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-lg font-bold text-primary">
                          $
                          {(isNashvilleEvent ? effectiveCash + effectiveStripe : stats.cashTotal + stats.stripeTotal + (stats.otherTotal ?? 0) + (stats.ccsTeamTotal ?? 0)).toFixed(2)}
                        </span>
                        {stripeTaxesFees > 0 && (
                          <span className="text-xs text-neutral-400">
                            Taxes/Fees collected via Stripe:{" "}
                            <span className="font-semibold text-accent">
                              ${stripeTaxesFees.toFixed(2)}{" "}
                            </span>
                            (to remain in bank)
                          </span>
                        )}
                        {!isNashvilleEvent && (stats.revenueFromCoupons ?? 0) > 0 && (
                          <div className="mt-2 pt-2 border-t border-neutral-600 flex items-center justify-between text-sm">
                            <span className="text-neutral-400">Revenue from Coupons (included in total)</span>
                            <span className="font-medium text-white">${(stats.revenueFromCoupons ?? 0).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isNashvilleEvent && (
                      <NashvilleBreakdown
                        effectiveCash={effectiveCash}
                        effectiveStripe={effectiveStripe}
                        stripeTaxesFees={stripeTaxesFees}
                        nashville={nashvilleFinances}
                        loading={loadingNashville}
                        error={nashvilleError}
                        saving={nashvilleSaving}
                        onPatch={patchNashville}
                      />
                    )}

                    {isWorkshopEvent && !isNashvilleEvent && (
                      <WorkshopBreakdown
                        computedTotalRevenue={stats.cashTotal + stats.stripeTotal + (stats.otherTotal ?? 0) + (stats.ccsTeamTotal ?? 0)}
                        workshop={workshopFinances}
                        loading={loadingWorkshop}
                        error={workshopError}
                        saving={workshopSaving}
                        onPatch={patchWorkshop}
                      />
                    )}

                    {isCompEvent && (
                      <CompBreakdown
                        computedTotalRevenue={stats.cashTotal + stats.stripeTotal + (stats.otherTotal ?? 0) + (stats.ccsTeamTotal ?? 0)}
                        compFinances={compFinances}
                        loading={loadingCompFinances}
                        error={compFinancesError}
                        saving={compFinancesSaving}
                        onPatch={patchCompFinances}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkshopBreakdown({
  computedTotalRevenue,
  workshop,
  loading,
  error,
  saving,
  onPatch,
}: {
  computedTotalRevenue: number;
  workshop: WorkshopFinances | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onPatch: (u: {
    studio_cost?: number;
    total_override?: number | null;
    guest_instructor_amount?: number | null;
    ccs_amount?: number | null;
  }) => Promise<void>;
}) {
  const effectiveTotalRevenue =
    workshop?.total_override != null ? Number(workshop.total_override) : computedTotalRevenue;
  const studioCost = workshop?.studio_cost != null ? Number(workshop.studio_cost) : 0;
  const remaining = Math.max(0, effectiveTotalRevenue - studioCost);
  const defaultGuest = Math.round(remaining * 0.9 * 100) / 100;
  const defaultCcs = Math.round(remaining * 0.1 * 100) / 100;
  const guestInstructorAmount =
    workshop?.guest_instructor_amount != null
      ? Number(workshop.guest_instructor_amount)
      : defaultGuest;
  const ccsAmount =
    workshop?.ccs_amount != null ? Number(workshop.ccs_amount) : defaultCcs;

  const [totalInput, setTotalInput] = useState(String(effectiveTotalRevenue));
  const [studioCostInput, setStudioCostInput] = useState(String(studioCost));
  const [guestInput, setGuestInput] = useState(String(guestInstructorAmount));
  const [ccsInput, setCcsInput] = useState(String(ccsAmount));

  useEffect(() => {
    setTotalInput(String(effectiveTotalRevenue));
  }, [effectiveTotalRevenue]);
  useEffect(() => {
    setStudioCostInput(String(studioCost));
  }, [studioCost]);
  useEffect(() => {
    setGuestInput(String(guestInstructorAmount));
  }, [guestInstructorAmount]);
  useEffect(() => {
    setCcsInput(String(ccsAmount));
  }, [ccsAmount]);

  const saveTotal = useCallback(() => {
    const v = parseFloat(totalInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ total_override: v });
  }, [totalInput, onPatch]);
  const saveStudioCost = useCallback(() => {
    const v = parseFloat(studioCostInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ studio_cost: v });
  }, [studioCostInput, onPatch]);
  const saveGuest = useCallback(() => {
    const v = parseFloat(guestInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ guest_instructor_amount: v });
  }, [guestInput, onPatch]);
  const saveCcs = useCallback(() => {
    const v = parseFloat(ccsInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ ccs_amount: v });
  }, [ccsInput, onPatch]);

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-neutral-700 bg-neutral-800/30 px-4 py-8 text-center text-neutral-400">
        Loading workshop breakdown…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
      <h3 className="mb-4 text-base font-semibold text-primary">Workshop breakdown</h3>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Total revenue</label>
          <div className="flex items-baseline gap-1">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              onBlur={saveTotal}
              disabled={saving}
              className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
          <span className="text-xs text-neutral-500">
            {workshop?.total_override != null ? "Override" : "From signups"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Studio cost</label>
          <div className="flex items-baseline gap-1">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={studioCostInput}
              onChange={(e) => setStudioCostInput(e.target.value)}
              onBlur={saveStudioCost}
              disabled={saving}
              className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-300">Remaining</span>
          <span className="text-lg font-bold text-white">${remaining.toFixed(2)}</span>
          <span className="text-xs text-neutral-500">(Total revenue − Studio cost)</span>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Guest Instructor (90%)</label>
          <div className="flex items-baseline gap-1">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              onBlur={saveGuest}
              disabled={saving}
              className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 font-semibold text-yellow-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
          {workshop?.guest_instructor_amount == null && (
            <span className="text-xs text-neutral-500">Auto (90%)</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">CCS (10%)</label>
          <div className="flex items-baseline gap-1">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={ccsInput}
              onChange={(e) => setCcsInput(e.target.value)}
              onBlur={saveCcs}
              disabled={saving}
              className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 font-semibold text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
          {workshop?.ccs_amount == null && (
            <span className="text-xs text-neutral-500">Auto (10%)</span>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-neutral-500">
          Itemized
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-neutral-300">
            <span>Total revenue</span>
            <span className="font-semibold text-white">${effectiveTotalRevenue.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-300">
            <span>Studio cost</span>
            <span className="font-semibold text-white">−${studioCost.toFixed(2)}</span>
          </div>
          <div className="my-2 border-t border-neutral-800" />
          <div className="flex items-center justify-between text-neutral-300">
            <span>Remaining</span>
            <span className="font-semibold text-white">${remaining.toFixed(2)}</span>
          </div>
          <div className="my-2 border-t border-neutral-800" />
          <div className="flex items-center justify-between text-neutral-300">
            <span>Guest Instructor</span>
            <span className="font-semibold text-yellow-400">${guestInstructorAmount.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-300">
            <span>CCS</span>
            <span className="font-semibold text-primary">${ccsAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompBreakdown({
  computedTotalRevenue,
  compFinances,
  loading,
  error,
  saving,
  onPatch,
}: {
  computedTotalRevenue: number;
  compFinances: CompFinances | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onPatch: (u: { studio_cost?: number; judges?: CompJudgePayoutInput[]; mark_judge_paid?: string }) => Promise<void>;
}) {
  const studioCost = compFinances?.studio_cost != null ? Number(compFinances.studio_cost) : 0;
  const judges = compFinances?.judges ?? [];
  const profit = Math.round((computedTotalRevenue - studioCost) * 100) / 100;
  const judgesTotal = judges.reduce((sum, j) => sum + (Number(j.amount_paid) || 0), 0);
  const profitAfterJudges = Math.round((profit - judgesTotal) * 100) / 100;

  const [studioCostInput, setStudioCostInput] = useState(String(studioCost));
  const [judgeRows, setJudgeRows] = useState<{ id: string; judge_name: string; amount_paid: number; paid: boolean; paid_at: string | null }[]>([]);
  const prevJudgesKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setStudioCostInput(String(studioCost));
  }, [studioCost]);

  useEffect(() => {
    const key = JSON.stringify(judges.map((j) => [j.id, j.judge_name, Number(j.amount_paid) || 0, !!j.paid, j.paid_at ?? null]));
    if (prevJudgesKeyRef.current === key) return;
    prevJudgesKeyRef.current = key;
    setJudgeRows(
      judges.map((j) => ({
        id: j.id,
        judge_name: j.judge_name ?? "",
        amount_paid: Number(j.amount_paid) || 0,
        paid: !!j.paid,
        paid_at: j.paid_at ?? null,
      }))
    );
  }, [judges]);

  const saveStudioCost = useCallback(() => {
    const v = parseFloat(studioCostInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ studio_cost: v });
  }, [studioCostInput, onPatch]);

  const saveJudges = useCallback(
    (rows: { id: string; judge_name: string; amount_paid: number; paid: boolean; paid_at: string | null }[]) => {
      onPatch({
        judges: rows.map((r) => ({
          judge_name: r.judge_name.trim(),
          amount_paid: r.amount_paid,
        })),
      });
    },
    [onPatch]
  );

  const markJudgePaid = useCallback(
    (judgeId: string) => {
      if (!judgeId || judgeId.startsWith("new-")) return;
      onPatch({ mark_judge_paid: judgeId });
    },
    [onPatch]
  );

  const addJudge = useCallback(() => {
    const newRows = [
      ...judgeRows,
      { id: `new-${Date.now()}`, judge_name: "", amount_paid: 0, paid: false, paid_at: null },
    ];
    setJudgeRows(newRows);
    saveJudges(newRows);
  }, [judgeRows, saveJudges]);

  const updateJudge = useCallback(
    (index: number, updates: { judge_name?: string; amount_paid?: number }) => {
      const next = judgeRows.map((r, i) =>
        i === index
          ? {
              ...r,
              ...(updates.judge_name !== undefined && { judge_name: updates.judge_name }),
              ...(updates.amount_paid !== undefined && { amount_paid: updates.amount_paid }),
            }
          : r
      );
      setJudgeRows(next);
      saveJudges(next);
    },
    [judgeRows, saveJudges]
  );

  const removeJudge = useCallback(
    (index: number) => {
      const next = judgeRows.filter((_, i) => i !== index);
      setJudgeRows(next);
      saveJudges(next);
    },
    [judgeRows, saveJudges]
  );

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-neutral-700 bg-neutral-800/30 px-4 py-8 text-center text-neutral-400">
        Loading comp breakdown…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
      <h3 className="mb-4 text-base font-semibold text-primary">Comp breakdown</h3>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Studio cost</label>
          <div className="flex items-baseline gap-1">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={studioCostInput}
              onChange={(e) => setStudioCostInput(e.target.value)}
              onBlur={saveStudioCost}
              disabled={saving}
              className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-300">Profit</span>
          <span className="text-lg font-bold text-white">${profit.toFixed(2)}</span>
          <span className="text-xs text-neutral-500">(Total revenue − Studio cost)</span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-300">Judges</p>
          <button
            type="button"
            onClick={addJudge}
            disabled={saving}
            className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:opacity-60"
          >
            Add judge
          </button>
        </div>
        {judgeRows.length === 0 ? (
          <p className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-sm text-neutral-500">
            No judges added. Click “Add judge” to record name and amount paid.
          </p>
        ) : (
          <div className="space-y-3">
            {judgeRows.map((row, index) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4"
              >
                <input
                  type="text"
                  placeholder="Judge name"
                  value={row.judge_name}
                  onChange={(e) => setJudgeRows((prev) => prev.map((r, i) => (i === index ? { ...r, judge_name: e.target.value } : r)))}
                  onBlur={(e) => updateJudge(index, { judge_name: e.currentTarget.value.trim() })}
                  disabled={saving}
                  className="min-w-[120px] flex-1 rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
                <div className="flex items-baseline gap-1">
                  <span className="text-neutral-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.amount_paid}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                      setJudgeRows((prev) => prev.map((r, i) => (i === index ? { ...r, amount_paid: Number.isNaN(v) ? 0 : v } : r)));
                    }}
                    onBlur={(e) => {
                      const v = e.currentTarget.value === "" ? 0 : parseFloat(e.currentTarget.value);
                      updateJudge(index, { amount_paid: Number.isNaN(v) ? 0 : v });
                    }}
                    disabled={saving}
                    className="w-24 rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeJudge(index)}
                  disabled={saving}
                  className="rounded border border-neutral-600 bg-neutral-900/40 px-2 py-1 text-sm text-neutral-400 transition hover:bg-neutral-700 hover:text-white disabled:opacity-60"
                >
                  Remove
                </button>
                {!row.id.startsWith("new-") && (
                  <div className="shrink-0">
                    {row.paid ? (
                      <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-center">
                        <p className="text-xs font-medium text-primary">Paid</p>
                        {row.paid_at && (
                          <p className="text-xs text-neutral-400">
                            {dayjs(row.paid_at).format("MMM D, YYYY")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markJudgePaid(row.id)}
                        disabled={saving}
                        className="rounded-lg bg-[#F2C94C] px-4 py-2 font-semibold text-black shadow-[0_0_10px_rgba(242,201,76,0.35)] transition hover:opacity-90 disabled:opacity-60"
                      >
                        Mark as paid
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {judgeRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
            <span className="text-sm font-medium text-neutral-300">Judges total</span>
            <span className="text-lg font-bold text-white">${judgesTotal.toFixed(2)}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm font-medium text-neutral-300">Profit after paying judges</span>
          <span className="text-lg font-bold text-primary">${profitAfterJudges.toFixed(2)}</span>
          <span className="text-xs text-neutral-500">(Profit − Judges total)</span>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-neutral-500">Itemized</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-neutral-300">
            <span>Total revenue</span>
            <span className="font-semibold text-white">${computedTotalRevenue.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-300">
            <span>Studio cost</span>
            <span className="font-semibold text-white">−${studioCost.toFixed(2)}</span>
          </div>
          <div className="my-2 border-t border-neutral-800" />
          <div className="flex items-center justify-between text-neutral-300">
            <span>Profit</span>
            <span className="font-semibold text-white">${profit.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-300">
            <span>Judges total</span>
            <span className="font-semibold text-white">−${judgesTotal.toFixed(2)}</span>
          </div>
          <div className="my-2 border-t border-neutral-800" />
          <div className="flex items-center justify-between text-neutral-300">
            <span>Profit after paying judges</span>
            <span className="font-semibold text-primary">${profitAfterJudges.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NashvilleBreakdown({
  effectiveCash,
  effectiveStripe,
  stripeTaxesFees,
  nashville,
  loading,
  error,
  saving,
  onPatch,
}: {
  effectiveCash: number;
  effectiveStripe: number;
  stripeTaxesFees: number;
  nashville: NashvilleFinances | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onPatch: (u: {
    venue_cost?: number;
    cash_override?: number | null;
    stripe_override?: number | null;
    bt1_name?: string;
    bt2_name?: string;
    bt3_name?: string | null;
    bt4_name?: string | null;
    upper_level_teacher_name?: string;
    bt1_payout_override?: number | null;
    bt2_payout_override?: number | null;
    bt3_payout_override?: number | null;
    bt4_payout_override?: number | null;
    upper_level_payout_override?: number | null;
    mark_bt1_paid?: boolean;
    mark_bt2_paid?: boolean;
    mark_bt3_paid?: boolean;
    mark_bt4_paid?: boolean;
    mark_upper_level_paid?: boolean;
  }) => Promise<void>;
}) {
  const venueCost = nashville?.venue_cost ?? 0;
  const totalRevenue = effectiveCash + effectiveStripe;
  const activeBtCount =
    nashville?.bt4_name != null && nashville.bt4_name.trim() !== ""
      ? 4
      : nashville?.bt3_name != null && nashville.bt3_name.trim() !== ""
        ? 3
        : 2;

  const autoPayouts = useMemo(
    () =>
      computeNashvillePayouts({
        cashTotal: effectiveCash,
        stripeTotal: effectiveStripe,
        venueCost,
        activeBtCount,
      }),
    [effectiveCash, effectiveStripe, venueCost, activeBtCount]
  );

  const effectivePayouts = useMemo(
    () =>
      computeNashvillePayouts({
        cashTotal: effectiveCash,
        stripeTotal: effectiveStripe,
        venueCost,
        activeBtCount,
        bt1Override: nashville?.bt1_payout_override ?? null,
        bt2Override: nashville?.bt2_payout_override ?? null,
        bt3Override: nashville?.bt3_payout_override ?? null,
        bt4Override: nashville?.bt4_payout_override ?? null,
        malissaOverride: nashville?.upper_level_payout_override ?? null,
      }),
    [
      effectiveCash,
      effectiveStripe,
      venueCost,
      activeBtCount,
      nashville?.bt1_payout_override,
      nashville?.bt2_payout_override,
      nashville?.bt3_payout_override,
      nashville?.bt4_payout_override,
      nashville?.upper_level_payout_override,
    ]
  );

  const allocations = useMemo(() => {
    const items = [
      { label: "Studio cost (venue)", value: venueCost },
      { label: "Beginner Teacher 1 payout", value: effectivePayouts.bt1Payout },
      { label: "Beginner Teacher 2 payout", value: effectivePayouts.bt2Payout },
    ];
    if (activeBtCount >= 3) {
      items.push({ label: "Beginner Teacher 3 payout", value: effectivePayouts.bt3Payout });
    }
    if (activeBtCount >= 4) {
      items.push({ label: "Beginner Teacher 4 payout", value: effectivePayouts.bt4Payout });
    }
    items.push(
      { label: "Upper Level Teacher payout", value: effectivePayouts.malissaPayout },
      { label: "Cash → Isaiah", value: effectivePayouts.isaiahPayout },
      { label: "Electronic → CCS", value: effectivePayouts.ccsElectronic }
    );
    return items;
  }, [
    venueCost,
    activeBtCount,
    effectivePayouts.bt1Payout,
    effectivePayouts.bt2Payout,
    effectivePayouts.bt3Payout,
    effectivePayouts.bt4Payout,
    effectivePayouts.malissaPayout,
    effectivePayouts.isaiahPayout,
    effectivePayouts.ccsElectronic,
  ]);

  const allocationsTotal = useMemo(
    () => allocations.reduce((sum, x) => sum + x.value, 0),
    [allocations]
  );
  const reconciliationDiff = useMemo(
    () => Math.round((totalRevenue - allocationsTotal) * 100) / 100,
    [totalRevenue, allocationsTotal]
  );

  const [venueInput, setVenueInput] = useState(String(venueCost));
  const [bt1Name, setBt1Name] = useState(nashville?.bt1_name ?? "Beginner Teacher 1");
  const [bt2Name, setBt2Name] = useState(nashville?.bt2_name ?? "Beginner Teacher 2");
  const [bt3Name, setBt3Name] = useState(nashville?.bt3_name ?? "Beginner Teacher 3");
  const [bt4Name, setBt4Name] = useState(nashville?.bt4_name ?? "Beginner Teacher 4");
  const [malissaName, setMalissaName] = useState(nashville?.upper_level_teacher_name ?? "Malissa");
  const [bt1PayoutInput, setBt1PayoutInput] = useState("");
  const [bt2PayoutInput, setBt2PayoutInput] = useState("");
  const [bt3PayoutInput, setBt3PayoutInput] = useState("");
  const [bt4PayoutInput, setBt4PayoutInput] = useState("");
  const [malissaPayoutInput, setMalissaPayoutInput] = useState("");
  const [payoutOverrideError, setPayoutOverrideError] = useState<string | null>(null);

  useEffect(() => {
    setVenueInput(String(nashville?.venue_cost ?? 0));
    setBt1Name(nashville?.bt1_name ?? "Beginner Teacher 1");
    setBt2Name(nashville?.bt2_name ?? "Beginner Teacher 2");
    setBt3Name(nashville?.bt3_name ?? "Beginner Teacher 3");
    setBt4Name(nashville?.bt4_name ?? "Beginner Teacher 4");
    setMalissaName(nashville?.upper_level_teacher_name ?? "Malissa");
  }, [
    nashville?.venue_cost,
    nashville?.bt1_name,
    nashville?.bt2_name,
    nashville?.bt3_name,
    nashville?.bt4_name,
    nashville?.upper_level_teacher_name,
  ]);

  useEffect(() => {
    setBt1PayoutInput(String(effectivePayouts.bt1Payout));
    setBt2PayoutInput(String(effectivePayouts.bt2Payout));
    setBt3PayoutInput(String(effectivePayouts.bt3Payout));
    setBt4PayoutInput(String(effectivePayouts.bt4Payout));
    setMalissaPayoutInput(String(effectivePayouts.malissaPayout));
    setPayoutOverrideError(null);
  }, [
    effectivePayouts.bt1Payout,
    effectivePayouts.bt2Payout,
    effectivePayouts.bt3Payout,
    effectivePayouts.bt4Payout,
    effectivePayouts.malissaPayout,
  ]);

  const saveVenueCost = () => {
    const v = parseFloat(venueInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ venue_cost: v });
  };

  const saveBt1Name = () => {
    const s = bt1Name.trim();
    if (s && s !== (nashville?.bt1_name ?? "Beginner Teacher 1")) onPatch({ bt1_name: s });
  };
  const saveBt2Name = () => {
    const s = bt2Name.trim();
    if (s && s !== (nashville?.bt2_name ?? "Beginner Teacher 2")) onPatch({ bt2_name: s });
  };
  const saveBt3Name = () => {
    const s = bt3Name.trim();
    if (s !== (nashville?.bt3_name ?? "")) onPatch({ bt3_name: s || null });
  };
  const saveBt4Name = () => {
    const s = bt4Name.trim();
    if (s !== (nashville?.bt4_name ?? "")) onPatch({ bt4_name: s || null });
  };
  const saveMalissaName = () => {
    const s = malissaName.trim();
    if (s && s !== (nashville?.upper_level_teacher_name ?? "Malissa")) onPatch({ upper_level_teacher_name: s });
  };

  const validateTeacherOverrides = useCallback(
    (next: {
      bt1?: number | null;
      bt2?: number | null;
      bt3?: number | null;
      bt4?: number | null;
      malissa?: number | null;
    }) => {
      const effectiveBt1 =
        next.bt1 !== undefined ? next.bt1 : (nashville?.bt1_payout_override ?? null);
      const effectiveBt2 =
        next.bt2 !== undefined ? next.bt2 : (nashville?.bt2_payout_override ?? null);
      const effectiveBt3 =
        next.bt3 !== undefined ? next.bt3 : (nashville?.bt3_payout_override ?? null);
      const effectiveBt4 =
        next.bt4 !== undefined ? next.bt4 : (nashville?.bt4_payout_override ?? null);
      const effectiveMalissa =
        next.malissa !== undefined ? next.malissa : (nashville?.upper_level_payout_override ?? null);

      const bt1 = effectiveBt1 ?? autoPayouts.bt1Payout;
      const bt2 = effectiveBt2 ?? autoPayouts.bt2Payout;
      const bt3 = effectiveBt3 ?? autoPayouts.bt3Payout;
      const bt4 = effectiveBt4 ?? autoPayouts.bt4Payout;
      const malissa = effectiveMalissa ?? autoPayouts.malissaPayout;

      const total = Math.round((bt1 + bt2 + bt3 + bt4 + malissa) * 100) / 100;
      const cap = effectivePayouts.cashAvailableForTeachers;
      if (total > cap + 0.0001) {
        return `Teacher payouts ($${total.toFixed(2)}) exceed available cash after venue cost ($${cap.toFixed(2)}).`;
      }
      return null;
    },
    [
      nashville?.bt1_payout_override,
      nashville?.bt2_payout_override,
      nashville?.bt3_payout_override,
      nashville?.bt4_payout_override,
      nashville?.upper_level_payout_override,
      autoPayouts.bt1Payout,
      autoPayouts.bt2Payout,
      autoPayouts.bt3Payout,
      autoPayouts.bt4Payout,
      autoPayouts.malissaPayout,
      effectivePayouts.cashAvailableForTeachers,
    ]
  );

  const saveBt1Override = () => {
    const v = parseFloat(bt1PayoutInput);
    if (Number.isNaN(v) || v < 0) return;
    const msg = validateTeacherOverrides({ bt1: v });
    setPayoutOverrideError(msg);
    if (!msg) onPatch({ bt1_payout_override: v });
  };
  const saveBt2Override = () => {
    const v = parseFloat(bt2PayoutInput);
    if (Number.isNaN(v) || v < 0) return;
    const msg = validateTeacherOverrides({ bt2: v });
    setPayoutOverrideError(msg);
    if (!msg) onPatch({ bt2_payout_override: v });
  };
  const saveBt3Override = () => {
    const v = parseFloat(bt3PayoutInput);
    if (Number.isNaN(v) || v < 0) return;
    const msg = validateTeacherOverrides({ bt3: v });
    setPayoutOverrideError(msg);
    if (!msg) onPatch({ bt3_payout_override: v });
  };
  const saveBt4Override = () => {
    const v = parseFloat(bt4PayoutInput);
    if (Number.isNaN(v) || v < 0) return;
    const msg = validateTeacherOverrides({ bt4: v });
    setPayoutOverrideError(msg);
    if (!msg) onPatch({ bt4_payout_override: v });
  };
  const saveMalissaOverride = () => {
    const v = parseFloat(malissaPayoutInput);
    if (Number.isNaN(v) || v < 0) return;
    const msg = validateTeacherOverrides({ malissa: v });
    setPayoutOverrideError(msg);
    if (!msg) onPatch({ upper_level_payout_override: v });
  };

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-neutral-700 bg-neutral-800/30 px-4 py-8 text-center text-neutral-400">
        Loading Nashville breakdown…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
      <h3 className="mb-4 text-base font-semibold text-primary">
        Nashville Country Swing Nights! — Payout breakdown
      </h3>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Venue cost</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={venueInput}
            onChange={(e) => setVenueInput(e.target.value)}
            onBlur={saveVenueCost}
            disabled={saving}
            className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          <span className="text-neutral-500">$</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-300">Profit</span>
          <span className="text-lg font-bold text-white">
            ${effectivePayouts.profit.toFixed(2)}
          </span>
          <span className="text-xs text-neutral-500">(Total revenue − Venue cost)</span>
        </div>
        {effectivePayouts.scale > 0 && effectivePayouts.scale < 1 && (
          <p className="rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            Payouts scaled to fit Cash after venue cost. Teacher shares adjusted equally so total does not exceed remaining Cash.
          </p>
        )}
        {effectivePayouts.manualOverridesApplied && (
          <p className="rounded border border-neutral-700 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300">
            Teacher payouts are using one or more manual overrides.
          </p>
        )}
        {effectivePayouts.manualOverridesAdjustedToFitCash && (
          <p className="rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            Manual teacher payouts exceeded available cash after venue cost; Upper Level Teacher was reduced to fit.
          </p>
        )}
        {payoutOverrideError && (
          <p className="rounded border border-primary/50 bg-primary/10 px-3 py-2 text-sm text-primary">
            {payoutOverrideError}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <TeacherRow
          label="Beginner Teacher 1"
          name={bt1Name}
          onNameChange={setBt1Name}
          onNameBlur={saveBt1Name}
          payout={effectivePayouts.bt1Payout}
          payoutInput={bt1PayoutInput}
          onPayoutChange={setBt1PayoutInput}
          onPayoutBlur={saveBt1Override}
          isPayoutOverride={(nashville?.bt1_payout_override ?? null) != null}
          autoPayout={autoPayouts.bt1Payout}
          onClearOverride={() => onPatch({ bt1_payout_override: null })}
          paid={nashville?.bt1_paid ?? false}
          paidAt={nashville?.bt1_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_bt1_paid: true })}
          saving={saving}
        />
        <TeacherRow
          label="Beginner Teacher 2"
          name={bt2Name}
          onNameChange={setBt2Name}
          onNameBlur={saveBt2Name}
          payout={effectivePayouts.bt2Payout}
          payoutInput={bt2PayoutInput}
          onPayoutChange={setBt2PayoutInput}
          onPayoutBlur={saveBt2Override}
          isPayoutOverride={(nashville?.bt2_payout_override ?? null) != null}
          autoPayout={autoPayouts.bt2Payout}
          onClearOverride={() => onPatch({ bt2_payout_override: null })}
          paid={nashville?.bt2_paid ?? false}
          paidAt={nashville?.bt2_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_bt2_paid: true })}
          saving={saving}
        />
        {activeBtCount >= 3 && (
          <TeacherRow
            label="Beginner Teacher 3"
            name={bt3Name}
            onNameChange={setBt3Name}
            onNameBlur={saveBt3Name}
            payout={effectivePayouts.bt3Payout}
            payoutInput={bt3PayoutInput}
            onPayoutChange={setBt3PayoutInput}
            onPayoutBlur={saveBt3Override}
            isPayoutOverride={(nashville?.bt3_payout_override ?? null) != null}
            autoPayout={autoPayouts.bt3Payout}
            onClearOverride={() => onPatch({ bt3_payout_override: null })}
            paid={nashville?.bt3_paid ?? false}
            paidAt={nashville?.bt3_paid_at ?? null}
            onMarkPaid={() => onPatch({ mark_bt3_paid: true })}
            saving={saving}
          />
        )}
        {activeBtCount >= 4 && (
          <TeacherRow
            label="Beginner Teacher 4"
            name={bt4Name}
            onNameChange={setBt4Name}
            onNameBlur={saveBt4Name}
            payout={effectivePayouts.bt4Payout}
            payoutInput={bt4PayoutInput}
            onPayoutChange={setBt4PayoutInput}
            onPayoutBlur={saveBt4Override}
            isPayoutOverride={(nashville?.bt4_payout_override ?? null) != null}
            autoPayout={autoPayouts.bt4Payout}
            onClearOverride={() => onPatch({ bt4_payout_override: null })}
            paid={nashville?.bt4_paid ?? false}
            paidAt={nashville?.bt4_paid_at ?? null}
            onMarkPaid={() => onPatch({ mark_bt4_paid: true })}
            saving={saving}
          />
        )}
        {activeBtCount < 4 && (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() =>
                onPatch(
                  activeBtCount === 2
                    ? { bt3_name: "Beginner Teacher 3" }
                    : { bt4_name: "Beginner Teacher 4" }
                )
              }
              disabled={saving}
              className="rounded-lg border border-dashed border-neutral-500 bg-neutral-800/30 px-4 py-2 text-sm font-medium text-neutral-400 hover:border-primary/50 hover:bg-neutral-800/50 hover:text-primary disabled:opacity-60"
            >
              + Add beginner teacher
            </button>
          </div>
        )}
        <TeacherRow
          label="Upper Level Teacher"
          name={malissaName}
          onNameChange={setMalissaName}
          onNameBlur={saveMalissaName}
          payout={effectivePayouts.malissaPayout}
          payoutInput={malissaPayoutInput}
          onPayoutChange={setMalissaPayoutInput}
          onPayoutBlur={saveMalissaOverride}
          isPayoutOverride={(nashville?.upper_level_payout_override ?? null) != null}
          autoPayout={autoPayouts.malissaPayout}
          onClearOverride={() => onPatch({ upper_level_payout_override: null })}
          paid={nashville?.upper_level_paid ?? false}
          paidAt={nashville?.upper_level_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_upper_level_paid: true })}
          saving={saving}
        />
      </div>

      <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-neutral-500">
          CCS total
        </p>
        <p className="mb-3 text-xl font-bold text-primary">
          ${(effectivePayouts.isaiahPayout + effectivePayouts.ccsElectronic).toFixed(2)}
        </p>
        <div className="space-y-1 text-sm">
          <p className="text-neutral-300">
            Cash → Isaiah: <span className="font-semibold text-primary">${effectivePayouts.isaiahPayout.toFixed(2)}</span>
          </p>
          <p className="text-neutral-300">
            Electronic → CCS: <span className="font-semibold text-accent">${effectivePayouts.ccsElectronic.toFixed(2)}</span>
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
          Itemized reconciliation
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-neutral-300">
            <span>Total revenue brought in (Cash + Stripe)</span>
            <span className="font-semibold text-white">${totalRevenue.toFixed(2)}</span>
          </div>
          <div className="my-2 border-t border-neutral-800" />
          {allocations.map((x) => (
            <div key={x.label} className="flex items-center justify-between text-neutral-300">
              <span>{x.label}</span>
              <span className="font-semibold text-white">${x.value.toFixed(2)}</span>
            </div>
          ))}
          <div className="my-2 border-t border-neutral-800" />
          <div className="flex items-center justify-between">
            <span className="text-neutral-300">Sum (studio cost + all payouts)</span>
            <span className="font-semibold text-white">${allocationsTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Difference</span>
            <span
              className={`font-semibold ${
                Math.abs(reconciliationDiff) < 0.01 ? "text-primary" : "text-primary"
              }`}
            >
              ${reconciliationDiff.toFixed(2)}
            </span>
          </div>
          {stripeTaxesFees > 0 && (
            <div className="mt-2 flex items-center justify-between text-neutral-300">
              <span>Taxes/Fees (to remain in bank)</span>
              <span className="font-semibold text-accent">
                ${stripeTaxesFees.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeacherRow({
  label,
  name,
  onNameChange,
  onNameBlur,
  payout,
  payoutInput,
  onPayoutChange,
  onPayoutBlur,
  isPayoutOverride,
  autoPayout,
  onClearOverride,
  paid,
  paidAt,
  onMarkPaid,
  saving,
}: {
  label: string;
  name: string;
  onNameChange: (s: string) => void;
  onNameBlur: () => void;
  payout: number;
  payoutInput: string;
  onPayoutChange: (s: string) => void;
  onPayoutBlur: () => void;
  isPayoutOverride: boolean;
  autoPayout: number;
  onClearOverride: () => void;
  paid: boolean;
  paidAt: string | null;
  onMarkPaid: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameBlur}
          disabled={saving}
          className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
      </div>
      <div className="shrink-0">
        <p className="text-xs text-neutral-500">Payout</p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={payoutInput}
            onChange={(e) => onPayoutChange(e.target.value)}
            onBlur={onPayoutBlur}
            disabled={saving}
            className="w-24 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 font-bold text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
        </div>
        <div className="mt-1 space-y-1 text-xs">
          {isPayoutOverride ? (
            <div className="flex items-center gap-2 text-neutral-400">
              <span>Auto: ${autoPayout.toFixed(2)}</span>
              <button
                type="button"
                onClick={onClearOverride}
                disabled={saving}
                className="rounded border border-neutral-600 bg-neutral-900/40 px-2 py-0.5 text-neutral-300 hover:bg-neutral-900/70 disabled:opacity-60"
              >
                Clear override
              </button>
            </div>
          ) : (
            <span className="text-neutral-500">Auto</span>
          )}
          <span className="text-neutral-500">Effective: ${payout.toFixed(2)}</span>
        </div>
      </div>
      <div className="shrink-0">
        {paid ? (
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-center">
            <p className="text-xs font-medium text-primary">Paid</p>
            {paidAt && (
              <p className="text-xs text-neutral-400">
                {dayjs(paidAt).format("MMM D, YYYY")}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={saving}
            className="rounded-lg bg-[#F2C94C] px-4 py-2 font-semibold text-black shadow-[0_0_10px_rgba(242,201,76,0.35)] transition hover:opacity-90 disabled:opacity-60"
          >
            Mark as paid
          </button>
        )}
      </div>
    </div>
  );
}
