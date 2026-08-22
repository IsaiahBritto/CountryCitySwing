"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";
import Link from "next/link";
import { isCcsInstructorRole } from "@/lib/instructorProfiles";
import {
  DEFAULT_SOCIAL_DOOR_PAYOUT,
  DEFAULT_SOCIAL_VENUE_COST,
  SOCIAL_EVENT_DOOR_PAYOUT,
  computeSocialDoorPayouts,
  computeSocialSplit,
  effectiveDoorAmount,
  isSocialDoorPayoutModel,
  normalizeDoorPayouts,
  type SocialDoorPayoutRow,
} from "@/lib/socialFinancesConstants";
import {
  doorPayoutRowsEqual,
  mergeDoorPayoutsFromSlots,
} from "@/lib/socialDoorPayoutsMerge";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import { computeNashvillePayouts } from "@/lib/utils/nashvillePayouts";
import {
  guestInstructorNameFromEventTitle,
  type MarkPaidRoute,
  type PaymentDueRow,
  type PaymentsDueByEvent,
} from "@/lib/financePaymentsDueTypes";
import { resolveCollectedTicketAmount } from "@/lib/utils/signupCollectedAmount";
import {
  buildWorkshopSignupBreakdown,
  combinedRegistrationTotal,
  computeTotalCouponDiscount,
  defaultCcsDiscountTotalFrom,
  netCollectedRegistrationTotal,
  type WorkshopEventPricing,
  type WorkshopSignupBreakdownRow,
  type WorkshopSignupBucketTotals,
} from "@/lib/financeSignupBreakdown";
import WorkshopSignupFinanceBreakdown from "@/components/admin/WorkshopSignupFinanceBreakdown";
import {
  ClassEventBreakdown,
  type ClassFinanceBase,
  type ClassFinancePayout,
} from "@/app/admin/finances/ClassEventBreakdown";
import {
  DEFAULT_UPPER_LEVEL_TEACHER,
  isNashvilleNightTitle,
} from "@/lib/nashvilleEventTitle";
import { computeClassEventFinances } from "@/lib/utils/classEventFinances";

type FinanceAccessLevel = "admin" | "social_viewer";

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
  guest_instructor_paid_at: string | null;
  updated_at: string;
}

interface TheSocialFinances {
  id: string;
  event_id: string;
  venue_cost: number;
  other_expense: number;
  other_expense_comment: string | null;
  door_payouts?: SocialDoorPayoutRow[];
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

interface InstructorOption {
  id: string;
  first_name?: string;
  last_name?: string;
  displayName: string;
  role?: string;
}

interface ScheduleSlotLite {
  id: string;
  position: string;
  assignee_id?: string | null;
  slot_starts_at?: string | null;
  assignee?: {
    first_name?: string;
    last_name?: string;
  } | null;
}

type EventsView =
  | "upcoming"
  | "past"
  | "overview"
  | "social_overview"
  | "payments_due";

function isYearOrAggregateView(view: EventsView): boolean {
  return view === "overview" || view === "social_overview";
}

function skipsEventDetailView(view: EventsView): boolean {
  return isYearOrAggregateView(view) || view === "payments_due";
}

function groupEventsByMonth(
  events: Event[],
  sort: "asc" | "desc" = "asc"
): { monthKey: string; label: string; events: Event[] }[] {
  const map = new Map<string, Event[]>();
  for (const ev of events) {
    const key = dayjs(ev.starts_at).format("YYYY-MM");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  const entries = Array.from(map.entries()).sort(([a], [b]) =>
    sort === "asc" ? a.localeCompare(b) : b.localeCompare(a)
  );
  return entries.map(([monthKey, monthEvents]) => ({
    monthKey,
    label: dayjs(`${monthKey}-01`).format("MMMM YYYY"),
    events: monthEvents,
  }));
}

function financesViewTabClass(active: boolean): string {
  return `flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
    active
      ? "bg-[#F2C94C] text-black shadow-[0_0_10px_rgba(242,201,76,0.35)]"
      : "text-primary/70 hover:bg-primary/15 hover:text-primary"
  }`;
}

function FinancesViewTabs({
  eventsView,
  onViewChange,
  isFullAdmin,
  canAccessSocialOverview,
}: {
  eventsView: EventsView;
  onViewChange: (view: EventsView) => void;
  isFullAdmin: boolean;
  canAccessSocialOverview: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Upcoming, past, overview, or social overview by year"
      className="mb-3 flex flex-wrap rounded-lg border border-primary/40 bg-neutral-900/80 p-0.5 ring-1 ring-primary/20"
    >
      <button
        type="button"
        onClick={() => onViewChange("upcoming")}
        className={financesViewTabClass(eventsView === "upcoming")}
      >
        Upcoming
      </button>
      <button
        type="button"
        onClick={() => onViewChange("past")}
        className={financesViewTabClass(eventsView === "past")}
      >
        Past
      </button>
      {isFullAdmin && (
        <button
          type="button"
          onClick={() => onViewChange("overview")}
          className={financesViewTabClass(eventsView === "overview")}
        >
          Overview
        </button>
      )}
      {canAccessSocialOverview && (
        <button
          type="button"
          onClick={() => onViewChange("social_overview")}
          className={financesViewTabClass(eventsView === "social_overview")}
        >
          Social
        </button>
      )}
      {isFullAdmin && (
        <button
          type="button"
          onClick={() => onViewChange("payments_due")}
          className={financesViewTabClass(eventsView === "payments_due")}
        >
          Due
        </button>
      )}
    </div>
  );
}

function PastMonthNav({
  monthLabel,
  canGoForward,
  onPrevious,
  onNext,
}: {
  monthLabel: string;
  canGoForward: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrevious}
        className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-primary/50 hover:text-white"
      >
        ← Prev
      </button>
      <span className="flex-1 text-center text-sm font-semibold text-white">{monthLabel}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoForward}
        className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-600 disabled:hover:text-neutral-300"
      >
        Next →
      </button>
    </div>
  );
}

const MARK_PAID_API_BASE: Record<MarkPaidRoute, string> = {
  "nashville-night-finances": "/api/admin/nashville-night-finances",
  "class-event-finances": "/api/admin/class-event-finances",
  "the-social-finances": "/api/admin/the-social-finances",
  "workshop-finances": "/api/admin/workshop-finances",
  "comp-finances": "/api/admin/comp-finances",
};

interface Event {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  price: number | null;
  price_changes?: unknown;
  ccs_team_price?: number | null;
  ccs_team_price_changes?: unknown;
  type?: string;
  time_zone?: string | null;
}

interface Signup {
  id: string;
  event_id: string;
  first_name?: string;
  last_name?: string;
  created_at?: string | null;
  payment_method: string;
  paid: boolean;
  checked_in: boolean;
  is_ccs_team?: boolean;
  amount_owed?: number | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  principal_refunded_total?: number | null;
  net_amount_paid?: number | null;
  stripe_tax_amount?: number | null;
  stripe_processing_fee?: number | null;
  free_via_promotion_code?: boolean;
  used_promotion_code?: boolean;
  refunded_or_cancelled?: string | null;
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
  coupon_discount_total: number;
  is_comp_event: boolean;
  refreshed_at: string;
}

function eventPricingFrom(event: Event | null | undefined): WorkshopEventPricing | null {
  if (!event) return null;
  return {
    price: event.price ?? null,
    price_changes: event.price_changes,
    ccs_team_price: event.ccs_team_price,
    ccs_team_price_changes: event.ccs_team_price_changes,
    time_zone: event.time_zone,
    starts_at: event.starts_at,
  };
}

function computeStats(
  signups: Signup[],
  eventPrice: number | null,
  _eventCcsTeamPrice: number | null | undefined,
  eventPricing?: WorkshopEventPricing | null
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
  couponDiscountTotal: number;
} {
  const price = eventPrice ?? 0;
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
    const paid = s.paid === true;

    if (freeViaPromo) freeViaPromoCount += 1;

    const amount = resolveCollectedTicketAmount(s, price);

    if (isCcsTeam) {
      if ((pm === "cash" || pm === "ccs team") && paid) {
        ccsTeamCashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "stripe" && paid) {
        ccsTeamStripeTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      }
    } else {
      if (freeViaPromo) continue;
      if (pm === "cash" && paid) {
        cashTotal += amount;
        if (usedPromo) revenueFromCoupons += amount;
      } else if (pm === "stripe" && paid) {
        stripeTotal += amount;
        stripeTaxesFees += (s.stripe_tax_amount ?? 0) + (s.stripe_processing_fee ?? 0);
        if (usedPromo) revenueFromCoupons += amount;
      } else if (s.checked_in && paid) {
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
    couponDiscountTotal: eventPricing
      ? computeTotalCouponDiscount(signups, eventPricing)
      : 0,
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
  couponDiscountTotal: number;
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
    couponDiscountTotal: 0,
  };
}

function aggregateStats(
  eventStats: { totalSignups: number; checkedIn: number; cashTotal: number; stripeTotal: number; otherTotal: number; ccsTeamCashTotal: number; ccsTeamStripeTotal: number; ccsTeamTotal: number; stripeTaxesFees: number; freeViaPromoCount: number; revenueFromCoupons: number; couponDiscountTotal: number }[]
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
  couponDiscountTotal: number;
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
      couponDiscountTotal: acc.couponDiscountTotal + (s.couponDiscountTotal ?? 0),
    }),
    { totalSignups: 0, checkedIn: 0, cashTotal: 0, stripeTotal: 0, otherTotal: 0, ccsTeamCashTotal: 0, ccsTeamStripeTotal: 0, ccsTeamTotal: 0, stripeTaxesFees: 0, freeViaPromoCount: 0, revenueFromCoupons: 0, couponDiscountTotal: 0 }
  );
}

export default function AdminFinancesPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsView, setEventsView] = useState<EventsView>("upcoming");
  const [pastEventsMonth, setPastEventsMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [paymentsDueEvents, setPaymentsDueEvents] = useState<PaymentsDueByEvent[] | null>(
    null
  );
  const [paymentsDueTotal, setPaymentsDueTotal] = useState(0);
  const [loadingPaymentsDue, setLoadingPaymentsDue] = useState(false);
  const [paymentsDueError, setPaymentsDueError] = useState<string | null>(null);
  const [markingPaymentDueId, setMarkingPaymentDueId] = useState<string | null>(null);
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
    couponDiscountTotal: number;
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
    totalClassPayouts: number;
    workshopCcsIncome: number;
    totalStripeTaxesFeesFromMerch: number;
    totalSocialAllocatedProfits: number;
  } | null>(null);
  const [socialOverviewStats, setSocialOverviewStats] = useState<{
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
    couponDiscountTotal: number;
  } | null>(null);
  const [socialOverviewFinances, setSocialOverviewFinances] = useState<{
    totalVenueCost: number;
    totalOtherExpense: number;
    totalDoor: number;
    totalBrandon: number;
    totalKyler: number;
    totalIsaiah: number;
    totalCcs: number;
    totalCcsCash: number;
    totalSocialAllocatedProfits: number;
  } | null>(null);
  const [loadingSocialOverview, setLoadingSocialOverview] = useState(false);
  const [socialOverviewError, setSocialOverviewError] = useState<string | null>(null);
  const [financeAccess, setFinanceAccess] = useState<FinanceAccessLevel | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const canAccessFinances =
    financeAccess === "admin" || financeAccess === "social_viewer";
  const isFullAdmin = financeAccess === "admin";
  const isSocialViewer = financeAccess === "social_viewer";
  const canAccessSocialOverview = isFullAdmin || isSocialViewer;
  const readOnlyFinance = isSocialViewer;
  const [error, setError] = useState<string | null>(null);
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [nashvilleFinances, setNashvilleFinances] = useState<NashvilleFinances | null>(null);
  const [loadingNashville, setLoadingNashville] = useState(false);
  const [nashvilleError, setNashvilleError] = useState<string | null>(null);
  const [nashvilleSaving, setNashvilleSaving] = useState(false);
  const [nashvilleCashInput, setNashvilleCashInput] = useState("");
  const [nashvilleStripeInput, setNashvilleStripeInput] = useState("");
  const [classFinanceBase, setClassFinanceBase] = useState<ClassFinanceBase | null>(null);
  const [classFinancePayouts, setClassFinancePayouts] = useState<ClassFinancePayout[]>([]);
  const [loadingClassFinances, setLoadingClassFinances] = useState(false);
  const [classFinancesError, setClassFinancesError] = useState<string | null>(null);
  const [classFinancesSaving, setClassFinancesSaving] = useState(false);
  const [workshopFinances, setWorkshopFinances] = useState<WorkshopFinances | null>(null);
  const [loadingWorkshop, setLoadingWorkshop] = useState(false);
  const [workshopError, setWorkshopError] = useState<string | null>(null);
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [workshopSignupRows, setWorkshopSignupRows] = useState<WorkshopSignupBreakdownRow[]>(
    []
  );
  const [workshopSignupTotals, setWorkshopSignupTotals] =
    useState<WorkshopSignupBucketTotals | null>(null);
  const [loadingWorkshopSignups, setLoadingWorkshopSignups] = useState(false);
  const [workshopSignupsError, setWorkshopSignupsError] = useState<string | null>(null);
  const [socialFinances, setSocialFinances] = useState<TheSocialFinances | null>(null);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialSaving, setSocialSaving] = useState(false);
  const [compFinances, setCompFinances] = useState<CompFinances | null>(null);
  const [loadingCompFinances, setLoadingCompFinances] = useState(false);
  const [compFinancesError, setCompFinancesError] = useState<string | null>(null);
  const [compFinancesSaving, setCompFinancesSaving] = useState(false);
  const [eventMetricsSaving, setEventMetricsSaving] = useState(false);
  const [eventCashInput, setEventCashInput] = useState("");
  const [eventStripeInput, setEventStripeInput] = useState("");
  const [eventStripeFeesInput, setEventStripeFeesInput] = useState("");
  const [financeInstructors, setFinanceInstructors] = useState<InstructorOption[]>(
    []
  );
  const [classBeginnerLeadDefault, setClassBeginnerLeadDefault] =
    useState<string>("Beginner Teacher 1");
  const [classBeginnerFollowDefault, setClassBeginnerFollowDefault] =
    useState<string>("Beginner Teacher 2");
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

  const pastMonthStart = dayjs(`${pastEventsMonth}-01`);
  const canGoForwardPastMonth = pastMonthStart.isBefore(dayjs().startOf("month"));

  const displayEvents = useMemo(() => {
    if (eventsView !== "past") return filteredEvents;
    const monthStartStr = `${pastEventsMonth}-01`;
    const monthEndStr = pastMonthStart.add(1, "month").format("YYYY-MM-DD");
    return filteredEvents.filter((e) => {
      const eventDate = dayjs(e.starts_at).format("YYYY-MM-DD");
      return eventDate >= monthStartStr && eventDate < monthEndStr;
    });
  }, [filteredEvents, eventsView, pastEventsMonth, pastMonthStart]);

  const handleEventsViewChange = useCallback(
    (view: EventsView) => {
      if (view === "past" && selectedEvent) {
        const today = dayjs().startOf("day");
        if (dayjs(selectedEvent.starts_at).isBefore(today, "day")) {
          setPastEventsMonth(dayjs(selectedEvent.starts_at).format("YYYY-MM"));
        }
      }
      setEventsView(view);
    },
    [selectedEvent]
  );

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

  const socialYears = useMemo(() => {
    const set = new Set<number>();
    for (const e of events) {
      if (isSocialEventType(e.type)) {
        set.add(dayjs(e.starts_at).year());
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [events]);

  const socialEventCountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of events) {
      if (!isSocialEventType(e.type)) continue;
      const y = dayjs(e.starts_at).year();
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const eventsInSelectedSocialYear = useMemo(() => {
    if (selectedYear == null) return [];
    return events
      .filter(
        (e) =>
          isSocialEventType(e.type) && dayjs(e.starts_at).year() === selectedYear
      )
      .sort((a, b) => {
        const da = dayjs(a.starts_at);
        const db = dayjs(b.starts_at);
        return da.isBefore(db) ? -1 : da.isAfter(db) ? 1 : 0;
      });
  }, [events, selectedYear]);

  useEffect(() => {
    const checkAccess = async () => {
      setCheckingAccess(true);
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setFinanceAccess(null);
        setAuthToken(null);
        setCheckingAccess(false);
        return;
      }
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          setFinanceAccess(null);
          setAuthToken(null);
          setCheckingAccess(false);
          return;
        }
        const data = await res.json();
        const access = data.finance_access as FinanceAccessLevel | null | undefined;
        const allowed = access === "admin" || access === "social_viewer";
        setFinanceAccess(allowed ? access! : null);
        setAuthToken(allowed ? session.access_token : null);
      } catch {
        setFinanceAccess(null);
        setAuthToken(null);
      } finally {
        setCheckingAccess(false);
      }
    };
    checkAccess();
  }, []);

  useEffect(() => {
    if (!canAccessFinances) return;

    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabaseBrowser
        .from("events")
        .select(
          "id, title, starts_at, location, price, price_changes, ccs_team_price, ccs_team_price_changes, type, time_zone"
        )
        .order("starts_at", { ascending: false });

      if (e) {
        setError("Failed to load events.");
        setEvents([]);
      } else {
        const loaded = (data as Event[]) || [];
        setEvents(
          isSocialViewer
            ? loaded.filter((ev) => isSocialEventType(ev.type))
            : loaded
        );
      }
      setLoading(false);
    };

    loadEvents();
  }, [canAccessFinances, isSocialViewer]);

  useEffect(() => {
    if (isSocialViewer && eventsView === "overview") {
      setEventsView("upcoming");
    }
  }, [isSocialViewer, eventsView]);

  useEffect(() => {
    if (isYearOrAggregateView(eventsView)) {
      const yearList = eventsView === "social_overview" ? socialYears : years;
      if (!yearList.length) {
        setSelectedYear(null);
        return;
      }
      const ok = selectedYear != null && yearList.includes(selectedYear);
      if (!ok) setSelectedYear(yearList[0]);
      return;
    }
    if (!displayEvents.length) {
      setSelectedEvent(null);
      return;
    }
    const stillInList = selectedEvent && displayEvents.some((e) => e.id === selectedEvent.id);
    if (!stillInList) setSelectedEvent(displayEvents[0]);
  }, [eventsView, displayEvents, years, socialYears, selectedYear, selectedEvent?.id]);

  useEffect(() => {
    if (!canAccessFinances || skipsEventDetailView(eventsView) || !selectedEvent) {
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
  }, [canAccessFinances, eventsView, selectedEvent, authToken]);

  const loadWorkshopSignupBreakdown = useCallback(async () => {
    if (!selectedEvent || !authToken) return;
    const isWorkshop =
      (selectedEvent.type || "").trim().toLowerCase() === "workshop";
    if (!isWorkshop) {
      setWorkshopSignupRows([]);
      setWorkshopSignupTotals(null);
      setWorkshopSignupsError(null);
      return;
    }

    setLoadingWorkshopSignups(true);
    setWorkshopSignupsError(null);
    try {
      const params = new URLSearchParams({
        event_id: selectedEvent.id,
        filter: "all",
      });
      const res = await fetch(`/api/signups?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string })?.error || "Failed to load registration breakdown"
        );
      }
      const data = await res.json();
      if (data.isComp) {
        setWorkshopSignupRows([]);
        setWorkshopSignupTotals(null);
        return;
      }
      const list = (data.signups || []) as Signup[];
      const { rows, totals } = buildWorkshopSignupBreakdown(list, {
        price: selectedEvent.price ?? null,
        price_changes: selectedEvent.price_changes,
        ccs_team_price: selectedEvent.ccs_team_price,
        ccs_team_price_changes: selectedEvent.ccs_team_price_changes,
        time_zone: selectedEvent.time_zone,
        starts_at: selectedEvent.starts_at,
      });
      setWorkshopSignupRows(rows);
      setWorkshopSignupTotals(totals);
    } catch (e) {
      setWorkshopSignupRows([]);
      setWorkshopSignupTotals(null);
      setWorkshopSignupsError(
        e instanceof Error ? e.message : "Failed to load registration breakdown"
      );
    } finally {
      setLoadingWorkshopSignups(false);
    }
  }, [selectedEvent, authToken]);

  useEffect(() => {
    if (
      !canAccessFinances ||
      skipsEventDetailView(eventsView) ||
      !selectedEvent ||
      !authToken ||
      (selectedEvent.type || "").trim().toLowerCase() !== "workshop"
    ) {
      setWorkshopSignupRows([]);
      setWorkshopSignupTotals(null);
      setWorkshopSignupsError(null);
      return;
    }
    loadWorkshopSignupBreakdown();
  }, [
    canAccessFinances,
    eventsView,
    selectedEvent,
    authToken,
    loadWorkshopSignupBreakdown,
  ]);

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
      if (isSocialEventType(selectedEvent.type)) {
        const sr = await fetch(
          `/api/admin/the-social-finances?event_id=${encodeURIComponent(selectedEvent.id)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (sr.ok) {
          const socialJson = await sr.json();
          setSocialFinances((socialJson.data ?? null) as TheSocialFinances | null);
        }
      }
      if ((selectedEvent.type || "").trim().toLowerCase() === "workshop") {
        await loadWorkshopSignupBreakdown();
      }
    } catch (e) {
      setSignupsError(e instanceof Error ? e.message : "Failed to refresh finance metrics");
    } finally {
      setRefreshingEventMetrics(false);
    }
  }, [selectedEvent, authToken, loadWorkshopSignupBreakdown]);

  const patchEventMetrics = useCallback(
    async (updates: {
      cash_total?: number;
      stripe_total?: number;
      stripe_taxes_fees_total?: number;
    }) => {
      if (!selectedEvent || !authToken) return;
      setEventMetricsSaving(true);
      setSignupsError(null);
      try {
        const res = await fetch("/api/admin/finance-metrics", {
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
          throw new Error(
            (body as { error?: string })?.error ||
              "Failed to save finance overrides"
          );
        }
        const { data } = await res.json();
        setEventMetrics((data ?? null) as EventFinanceMetrics | null);
      } catch (e) {
        setSignupsError(
          e instanceof Error ? e.message : "Failed to save finance overrides"
        );
      } finally {
        setEventMetricsSaving(false);
      }
    },
    [selectedEvent, authToken]
  );

  useEffect(() => {
    if (!isFullAdmin || eventsView !== "overview" || selectedYear == null || !eventsInSelectedYear.length) {
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
              couponDiscountTotal: Number(m?.coupon_discount_total ?? 0),
            };

            let nashvilleFinances: NashvilleFinances | null = null;
            let classEventFinances: {
              base: ClassFinanceBase | null;
              payouts: ClassFinancePayout[];
            } | null = null;
            let workshopFinances: WorkshopFinances | null = null;
            let socialFinancesOverview: TheSocialFinances | null = null;
            let compFinances: CompFinances | null = null;

            if (isNashville(ev)) {
              const nr = await fetch(`/api/admin/nashville-night-finances?event_id=${ev.id}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (nr.ok) {
                const { data } = await nr.json();
                nashvilleFinances = data ?? null;
              }
            } else if ((ev.type || "").trim().toLowerCase() === "class") {
              const cr = await fetch(`/api/admin/class-event-finances?event_id=${ev.id}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (cr.ok) {
                const { data } = await cr.json();
                classEventFinances = {
                  base: data?.base ?? null,
                  payouts: data?.payouts ?? [],
                };
              }
            }
            // Fetch workshop finances for non-Nashville, non-class events (or events with workshop rows).
            if (
              !isNashville(ev) &&
              (ev.type || "").trim().toLowerCase() !== "class"
            ) {
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
            if ((ev.type || "").trim().toLowerCase() === "social") {
              const sr = await fetch(`/api/admin/the-social-finances?event_id=${ev.id}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (sr.ok) {
                const { data } = await sr.json();
                socialFinancesOverview = data ?? null;
              }
            }

            return {
              stats,
              nashvilleFinances,
              classEventFinances,
              workshopFinances,
              socialFinancesOverview,
              compFinances,
            };
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
        let totalClassPayouts = 0;
        let workshopCcsIncome = 0;
        let totalSocialAllocatedProfits = 0;

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
          if (r.classEventFinances?.base) {
            const cf = r.classEventFinances;
            const venueCost = Number(cf.base?.venue_cost) || 0;
            totalStudioRentals += venueCost;
            const cash =
              cf.base?.cash_override != null
                ? Number(cf.base.cash_override)
                : r.stats.cashTotal;
            const stripe =
              cf.base?.stripe_override != null
                ? Number(cf.base.stripe_override)
                : r.stats.stripeTotal;
            const payoutAmounts = (cf.payouts ?? []).map((p) => Number(p.amount) || 0);
            const classSplit = computeClassEventFinances({
              cashTotal: cash,
              stripeTotal: stripe,
              venueCost,
              payoutAmounts,
            });
            totalClassPayouts += classSplit.payoutTotal;
          }
          if (r.workshopFinances && (ev.type || "").trim().toLowerCase() !== "class") {
            totalStudioRentals += Number(r.workshopFinances.studio_cost) || 0;
            workshopCcsIncome += Number(r.workshopFinances.ccs_amount) || 0;
          }
          if (r.compFinances) {
            totalStudioRentals += Number(r.compFinances.studio_cost) || 0;
            for (const j of r.compFinances.judges ?? []) {
              totalPaidJudges += Number(j.amount_paid) || 0;
            }
          }
          if (r.socialFinancesOverview) {
            const sf = r.socialFinancesOverview;
            totalStudioRentals +=
              (Number(sf.venue_cost) || 0) + (Number(sf.other_expense) || 0);
            totalSocialAllocatedProfits +=
              (Number(sf.brandon_profit) || 0) +
              (Number(sf.kyler_profit) || 0) +
              (Number(sf.isaiah_profit) || 0);
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
          totalClassPayouts: Math.round(totalClassPayouts * 100) / 100,
          workshopCcsIncome: Math.round(workshopCcsIncome * 100) / 100,
          totalStripeTaxesFeesFromMerch,
          totalSocialAllocatedProfits: Math.round(totalSocialAllocatedProfits * 100) / 100,
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
  }, [isFullAdmin, eventsView, selectedYear, eventsInSelectedYear, authToken]);

  useEffect(() => {
    if (!isFullAdmin || eventsView !== "payments_due") {
      setPaymentsDueEvents(null);
      setPaymentsDueTotal(0);
      setPaymentsDueError(null);
      setLoadingPaymentsDue(false);
      return;
    }

    const loadPaymentsDue = async () => {
      setLoadingPaymentsDue(true);
      setPaymentsDueError(null);
      try {
        if (!authToken) {
          setPaymentsDueEvents(null);
          setPaymentsDueTotal(0);
          setPaymentsDueError("Session expired. Please sign in again.");
          return;
        }
        const res = await fetch("/api/admin/payments-due", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string })?.error || "Failed to load payments due"
          );
        }
        const json = (await res.json()) as {
          events?: PaymentsDueByEvent[];
          totalOutstanding?: number;
        };
        setPaymentsDueEvents(Array.isArray(json.events) ? json.events : []);
        setPaymentsDueTotal(Number(json.totalOutstanding) || 0);
      } catch (e) {
        setPaymentsDueEvents(null);
        setPaymentsDueTotal(0);
        setPaymentsDueError(
          e instanceof Error ? e.message : "Failed to load payments due"
        );
      } finally {
        setLoadingPaymentsDue(false);
      }
    };

    loadPaymentsDue();
  }, [isFullAdmin, eventsView, authToken]);

  const markPaymentDuePaid = useCallback(
    async (row: PaymentDueRow) => {
      if (!authToken) return;
      setMarkingPaymentDueId(row.id);
      setPaymentsDueError(null);
      try {
        const url = MARK_PAID_API_BASE[row.markPaid.route];
        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(row.markPaid.body),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to mark as paid");
        }
        setPaymentsDueEvents((prev) => {
          if (!prev) return prev;
          const next = prev
            .map((ev) => ({
              ...ev,
              rows: ev.rows.filter((r) => r.id !== row.id),
            }))
            .filter((ev) => ev.rows.length > 0);
          return next;
        });
        setPaymentsDueTotal((prev) =>
          Math.max(0, Math.round((prev - row.amount) * 100) / 100)
        );
      } catch (e) {
        setPaymentsDueError(
          e instanceof Error ? e.message : "Failed to mark as paid"
        );
      } finally {
        setMarkingPaymentDueId(null);
      }
    },
    [authToken]
  );

  const openEventFinances = useCallback(
    (eventId: string, eventStart: string | null) => {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) return;
      const now = dayjs();
      const isPast = eventStart ? dayjs(eventStart).isBefore(now, "day") : true;
      setEventsView(isPast ? "past" : "upcoming");
      if (isPast && eventStart) {
        setPastEventsMonth(dayjs(eventStart).format("YYYY-MM"));
      }
      setSelectedEvent(ev);
    },
    [events]
  );

  useEffect(() => {
    if (
      !canAccessSocialOverview ||
      eventsView !== "social_overview" ||
      selectedYear == null ||
      !eventsInSelectedSocialYear.length
    ) {
      setSocialOverviewStats(null);
      setSocialOverviewFinances(null);
      setSocialOverviewError(null);
      return;
    }

    const loadSocialOverview = async () => {
      setLoadingSocialOverview(true);
      setSocialOverviewError(null);
      try {
        if (!authToken) {
          setSocialOverviewError("Session expired. Please sign in again.");
          setSocialOverviewStats(null);
          setSocialOverviewFinances(null);
          setLoadingSocialOverview(false);
          return;
        }

        const eventIds = eventsInSelectedSocialYear.map((ev) => ev.id);
        const metricsRes = await fetch(
          `/api/admin/finance-metrics?event_ids=${encodeURIComponent(eventIds.join(","))}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
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
          eventsInSelectedSocialYear.map(async (ev) => {
            const m = metricsByEventId.get(ev.id);
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
              couponDiscountTotal: Number(m?.coupon_discount_total ?? 0),
            };

            let socialFinancesOverview: TheSocialFinances | null = null;
            const sr = await fetch(`/api/admin/the-social-finances?event_id=${ev.id}`, {
              headers: { Authorization: `Bearer ${authToken}` },
            });
            if (sr.ok) {
              const { data } = await sr.json();
              socialFinancesOverview = data ?? null;
            }

            return { stats, socialFinancesOverview };
          })
        );

        setSocialOverviewStats(aggregateStats(results.map((r) => r.stats)));

        let totalVenueCost = 0;
        let totalOtherExpense = 0;
        let totalDoor = 0;
        let totalBrandon = 0;
        let totalKyler = 0;
        let totalIsaiah = 0;
        let totalCcs = 0;
        let totalCcsCash = 0;

        for (const r of results) {
          if (!r.socialFinancesOverview) continue;
          const sf = r.socialFinancesOverview;
          totalVenueCost += Number(sf.venue_cost) || 0;
          totalOtherExpense += Number(sf.other_expense) || 0;
          const doors = normalizeDoorPayouts(sf.door_payouts);
          for (const d of doors) {
            totalDoor += effectiveDoorAmount(d);
          }
          totalBrandon += Number(sf.brandon_profit) || 0;
          totalKyler += Number(sf.kyler_profit) || 0;
          totalIsaiah += Number(sf.isaiah_profit) || 0;
          totalCcs += Number(sf.ccs_profit) || 0;
          totalCcsCash += Number(sf.ccs_cash_profit) || 0;
        }

        const totalSocialAllocatedProfits =
          totalBrandon + totalKyler + totalIsaiah + totalDoor;

        setSocialOverviewFinances({
          totalVenueCost: Math.round(totalVenueCost * 100) / 100,
          totalOtherExpense: Math.round(totalOtherExpense * 100) / 100,
          totalDoor: Math.round(totalDoor * 100) / 100,
          totalBrandon: Math.round(totalBrandon * 100) / 100,
          totalKyler: Math.round(totalKyler * 100) / 100,
          totalIsaiah: Math.round(totalIsaiah * 100) / 100,
          totalCcs: Math.round(totalCcs * 100) / 100,
          totalCcsCash: Math.round(totalCcsCash * 100) / 100,
          totalSocialAllocatedProfits: Math.round(totalSocialAllocatedProfits * 100) / 100,
        });
      } catch (e) {
        setSocialOverviewError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setSocialOverviewStats(null);
        setSocialOverviewFinances(null);
      } finally {
        setLoadingSocialOverview(false);
      }
    };

    loadSocialOverview();
  }, [
    canAccessSocialOverview,
    eventsView,
    selectedYear,
    eventsInSelectedSocialYear,
    authToken,
  ]);

  const isNashvilleEvent = isNashvilleNightTitle(selectedEvent?.title);
  const selectedType = (selectedEvent?.type ?? "").trim().toLowerCase();
  const isWorkshopEvent = selectedType === "workshop";
  const isClassEvent = selectedType === "class";
  const isGenericClassEvent = isClassEvent && !isNashvilleEvent;
  const isSocialEvent = selectedType === "social";
  const usesNashvilleFinanceRecord = isNashvilleEvent;
  const usesClassEventFinanceRecord = isGenericClassEvent;

  useEffect(() => {
    if (
      !isFullAdmin ||
      skipsEventDetailView(eventsView) ||
      !selectedEvent ||
      !usesNashvilleFinanceRecord
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
  }, [
    isFullAdmin,
    eventsView,
    selectedEvent?.id,
    usesNashvilleFinanceRecord,
    authToken,
  ]);

  useEffect(() => {
    if (
      !isFullAdmin ||
      skipsEventDetailView(eventsView) ||
      !selectedEvent ||
      !usesClassEventFinanceRecord
    ) {
      setClassFinanceBase(null);
      setClassFinancePayouts([]);
      setClassFinancesError(null);
      return;
    }

    const load = async () => {
      setLoadingClassFinances(true);
      setClassFinancesError(null);
      try {
        if (!authToken) {
          setClassFinancesError("Session expired. Please sign in again.");
          setClassFinanceBase(null);
          setClassFinancePayouts([]);
          setLoadingClassFinances(false);
          return;
        }
        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const res = await fetch(`/api/admin/class-event-finances?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setClassFinancesError(
            (body as { error?: string })?.error || "Failed to load class finances"
          );
          setClassFinanceBase(null);
          setClassFinancePayouts([]);
        } else {
          const { data } = await res.json();
          setClassFinanceBase(data?.base ?? null);
          setClassFinancePayouts(data?.payouts ?? []);
        }
      } catch (e) {
        setClassFinancesError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setClassFinanceBase(null);
        setClassFinancePayouts([]);
      } finally {
        setLoadingClassFinances(false);
      }
    };

    load();
  }, [
    isFullAdmin,
    eventsView,
    selectedEvent?.id,
    usesClassEventFinanceRecord,
    authToken,
  ]);

  useEffect(() => {
    if (
      !isFullAdmin ||
      skipsEventDetailView(eventsView) ||
      !selectedEvent ||
      !isClassEvent
    ) {
      setFinanceInstructors([]);
      setClassBeginnerLeadDefault("Beginner Teacher 1");
      setClassBeginnerFollowDefault("Beginner Teacher 2");
      return;
    }

    const loadClassDefaults = async () => {
      try {
        if (!authToken) return;
        const [instructorsRes, slotsRes] = await Promise.all([
          fetch("/api/schedule/instructors", {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
          fetch(
            `/api/schedule/slots?event_id=${encodeURIComponent(selectedEvent.id)}`,
            {
              headers: { Authorization: `Bearer ${authToken}` },
            }
          ),
        ]);

        if (instructorsRes.ok) {
          const data = await instructorsRes.json();
          const list = ((data?.instructors ?? []) as InstructorOption[]).filter((i) =>
            isCcsInstructorRole(i.role)
          );
          setFinanceInstructors(list);
        }

        if (slotsRes.ok) {
          const data = await slotsRes.json();
          const slots = (data?.slots ?? []) as ScheduleSlotLite[];
          const toName = (s?: ScheduleSlotLite) => {
            const n = [s?.assignee?.first_name, s?.assignee?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim();
            return n || "";
          };

          const leadSlot = slots.find((s) =>
            s.position.toLowerCase().includes("beginner lead teacher")
          );
          const followSlot = slots.find((s) =>
            s.position.toLowerCase().includes("beginner follow teacher")
          );

          setClassBeginnerLeadDefault(toName(leadSlot) || "Beginner Teacher 1");
          setClassBeginnerFollowDefault(
            toName(followSlot) || "Beginner Teacher 2"
          );
        }
      } catch {
        // Non-fatal; defaults remain fallback values.
      }
    };

    loadClassDefaults();
  }, [isFullAdmin, eventsView, selectedEvent?.id, isClassEvent, authToken]);

  useEffect(() => {
    if (
      !isFullAdmin ||
      skipsEventDetailView(eventsView) ||
      !selectedEvent ||
      !isWorkshopEvent
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
  }, [
    isFullAdmin,
    eventsView,
    selectedEvent?.id,
    isWorkshopEvent,
    authToken,
  ]);

  useEffect(() => {
    if (
      !canAccessFinances ||
      skipsEventDetailView(eventsView) ||
      !selectedEvent ||
      !isSocialEvent
    ) {
      setSocialFinances(null);
      setSocialError(null);
      return;
    }

    const load = async () => {
      setLoadingSocial(true);
      setSocialError(null);
      try {
        if (!authToken) {
          setSocialError("Session expired. Please sign in again.");
          setSocialFinances(null);
          setLoadingSocial(false);
          return;
        }
        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const [res, slotsRes] = await Promise.all([
          fetch(`/api/admin/the-social-finances?${params}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
          isSocialDoorPayoutModel(selectedEvent.starts_at, selectedEvent.time_zone)
            ? fetch(
                `/api/schedule/slots?event_id=${encodeURIComponent(selectedEvent.id)}`,
                { headers: { Authorization: `Bearer ${authToken}` } }
              )
            : Promise.resolve(null),
        ]);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setSocialError(
            (body as { error?: string })?.error || "Failed to load social finances"
          );
          setSocialFinances(null);
        } else {
          const { data } = await res.json();
          let social = (data ?? null) as TheSocialFinances | null;
          const doorModelActive = isSocialDoorPayoutModel(
            selectedEvent.starts_at,
            selectedEvent.time_zone
          );

          if (doorModelActive && slotsRes?.ok) {
            const slotsJson = await slotsRes.json().catch(() => ({}));
            const slots = (slotsJson?.slots ?? []) as ScheduleSlotLite[];
            const apiDoors = normalizeDoorPayouts(social?.door_payouts);
            const mergedDoors = mergeDoorPayoutsFromSlots({
              existingRows: apiDoors,
              slots: slots.map((s) => ({
                id: s.id,
                position: s.position,
                assignee_id: s.assignee_id ?? null,
                slot_starts_at: s.slot_starts_at,
                assignee: s.assignee,
              })),
              defaultAmount: SOCIAL_EVENT_DOOR_PAYOUT,
            });

            if (
              isFullAdmin &&
              authToken &&
              !doorPayoutRowsEqual(apiDoors, mergedDoors)
            ) {
              const patchRes = await fetch("/api/admin/the-social-finances", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  event_id: selectedEvent.id,
                  door_payouts: mergedDoors,
                }),
              });
              if (patchRes.ok) {
                const patchJson = await patchRes.json();
                social = (patchJson.data ?? social) as TheSocialFinances | null;
                if (social) {
                  social = { ...social, door_payouts: mergedDoors };
                }
              } else if (social) {
                social = { ...social, door_payouts: mergedDoors };
              }
            } else if (social) {
              social = { ...social, door_payouts: mergedDoors };
            } else if (mergedDoors.length > 0) {
              social = {
                id: "pending",
                event_id: selectedEvent.id,
                venue_cost: DEFAULT_SOCIAL_VENUE_COST,
                other_expense: 0,
                other_expense_comment: null,
                door_payouts: mergedDoors,
                brandon_split_ratio: 0,
                kyler_split_ratio: 0,
                isaiah_split_ratio: 1,
                brandon_profit: 0,
                kyler_profit: 0,
                isaiah_profit: 0,
                ccs_profit: 0,
                ccs_cash_profit: 0,
                brandon_paid_at: null,
                kyler_paid_at: null,
                isaiah_paid_at: null,
                updated_at: new Date().toISOString(),
              };
            }
          }

          setSocialFinances(social);
        }
      } catch (e) {
        setSocialError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setSocialFinances(null);
      } finally {
        setLoadingSocial(false);
      }
    };

    load();
  }, [canAccessFinances, eventsView, selectedEvent?.id, selectedEvent?.starts_at, selectedEvent?.time_zone, isSocialEvent, authToken, isFullAdmin]);

  useEffect(() => {
    if (
      !isFullAdmin ||
      skipsEventDetailView(eventsView) ||
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
  }, [isFullAdmin, eventsView, selectedEvent?.id, isCompEvent]);

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
      mark_guest_instructor_paid?: boolean;
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

  const patchSocial = useCallback(
    async (updates: {
      venue_cost?: number;
      other_expense?: number;
      other_expense_comment?: string | null;
      brandon_split_ratio?: number;
      kyler_split_ratio?: number;
      isaiah_split_ratio?: number;
      brandon_profit?: number;
      kyler_profit?: number;
      mark_brandon_paid?: boolean;
      mark_kyler_paid?: boolean;
      mark_isaiah_paid?: boolean;
      door_payouts?: SocialDoorPayoutRow[];
      mark_door_paid_index?: number;
    }) => {
      if (!selectedEvent || !isSocialEvent || !authToken) return;
      setSocialSaving(true);
      try {
        const res = await fetch("/api/admin/the-social-finances", {
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
        setSocialFinances(data);
      } catch (e) {
        console.error("Social finances PATCH:", e);
        setSocialError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSocialSaving(false);
      }
    },
    [selectedEvent?.id, isSocialEvent, authToken]
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
      if (!selectedEvent || !usesNashvilleFinanceRecord || !authToken) return;
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
    [selectedEvent?.id, usesNashvilleFinanceRecord, authToken]
  );

  const reloadClassFinances = useCallback(async () => {
    if (!selectedEvent || !authToken) return;
    const params = new URLSearchParams({ event_id: selectedEvent.id });
    const res = await fetch(`/api/admin/class-event-finances?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      const { data } = await res.json();
      setClassFinanceBase(data?.base ?? null);
      setClassFinancePayouts(data?.payouts ?? []);
    }
  }, [selectedEvent?.id, authToken]);

  const patchClassFinanceBase = useCallback(
    async (updates: {
      venue_cost?: number;
      cash_override?: number | null;
      stripe_override?: number | null;
    }) => {
      if (!selectedEvent || !usesClassEventFinanceRecord || !authToken) return;
      setClassFinancesSaving(true);
      try {
        const res = await fetch("/api/admin/class-event-finances", {
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
        if (data?.base) setClassFinanceBase(data.base);
      } catch (e) {
        console.error("Class finances PATCH base:", e);
        setClassFinancesError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setClassFinancesSaving(false);
      }
    },
    [selectedEvent?.id, usesClassEventFinanceRecord, authToken]
  );

  const patchClassFinancePayout = useCallback(
    async (
      payoutId: string,
      updates: {
        role_label?: string;
        payee_name?: string;
        amount?: number;
        mark_paid?: boolean;
      }
    ) => {
      if (!selectedEvent || !usesClassEventFinanceRecord || !authToken) return;
      setClassFinancesSaving(true);
      try {
        const res = await fetch("/api/admin/class-event-finances", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            event_id: selectedEvent.id,
            payout_id: payoutId,
            ...updates,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to save");
        }
        await reloadClassFinances();
      } catch (e) {
        console.error("Class finances PATCH payout:", e);
        setClassFinancesError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setClassFinancesSaving(false);
      }
    },
    [selectedEvent?.id, usesClassEventFinanceRecord, authToken, reloadClassFinances]
  );

  const addClassFinancePayout = useCallback(
    async (payload: { role_label?: string; payee_name: string; amount?: number }) => {
      if (!selectedEvent || !usesClassEventFinanceRecord || !authToken) return;
      setClassFinancesSaving(true);
      try {
        const res = await fetch("/api/admin/class-event-finances", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            event_id: selectedEvent.id,
            ...payload,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to add payout");
        }
        await reloadClassFinances();
      } catch (e) {
        console.error("Class finances POST:", e);
        setClassFinancesError(e instanceof Error ? e.message : "Failed to add payout");
      } finally {
        setClassFinancesSaving(false);
      }
    },
    [selectedEvent?.id, usesClassEventFinanceRecord, authToken, reloadClassFinances]
  );

  const deleteClassFinancePayout = useCallback(
    async (payoutId: string) => {
      if (!selectedEvent || !usesClassEventFinanceRecord || !authToken) return;
      setClassFinancesSaving(true);
      try {
        const params = new URLSearchParams({
          event_id: selectedEvent.id,
          payout_id: payoutId,
        });
        const res = await fetch(`/api/admin/class-event-finances?${params}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error || "Failed to delete payout");
        }
        await reloadClassFinances();
      } catch (e) {
        console.error("Class finances DELETE:", e);
        setClassFinancesError(e instanceof Error ? e.message : "Failed to delete payout");
      } finally {
        setClassFinancesSaving(false);
      }
    },
    [selectedEvent?.id, usesClassEventFinanceRecord, authToken, reloadClassFinances]
  );

  const stats =
    eventsView === "overview" && overviewStats
      ? overviewStats
      : eventsView === "social_overview" && socialOverviewStats
      ? socialOverviewStats
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
            couponDiscountTotal: Number(eventMetrics.coupon_discount_total) || 0,
          }
        : isCompEvent
          ? computeStatsComp(compSignups)
          : computeStats(
              signups,
              selectedEvent?.price ?? null,
              selectedEvent?.ccs_team_price ?? null,
              eventPricingFrom(selectedEvent)
            );

  const effectiveCouponDiscount =
    stats.couponDiscountTotal ??
    workshopSignupTotals?.totalCouponDiscount ??
    0;

  const effectiveDefaultCcsDiscount = defaultCcsDiscountTotalFrom(stats);

  const classFinanceOverrides = isNashvilleEvent ? nashvilleFinances : classFinanceBase;

  const effectiveCash =
    isClassEvent && classFinanceOverrides?.cash_override != null
      ? classFinanceOverrides.cash_override
      : stats.cashTotal;
  const effectiveStripe =
    isClassEvent && classFinanceOverrides?.stripe_override != null
      ? classFinanceOverrides.stripe_override
      : stats.stripeTotal;

  const netCollectedTotal = isClassEvent
    ? effectiveCash + effectiveStripe
    : netCollectedRegistrationTotal(stats);

  const combinedTotal = isClassEvent
    ? netCollectedTotal + effectiveCouponDiscount
    : combinedRegistrationTotal({
        ...stats,
        couponDiscountTotal: effectiveCouponDiscount,
      });

  const stripeTaxesFees = stats.stripeTaxesFees ?? 0;

  useEffect(() => {
    if (isClassEvent) {
      setNashvilleCashInput(String(effectiveCash));
      setNashvilleStripeInput(String(effectiveStripe));
    }
  }, [isClassEvent, effectiveCash, effectiveStripe]);

  useEffect(() => {
    if (!isClassEvent) {
      setEventCashInput(String(stats.cashTotal));
      setEventStripeInput(String(stats.stripeTotal));
    }
    setEventStripeFeesInput(String(stripeTaxesFees));
  }, [
    isClassEvent,
    stats.cashTotal,
    stats.stripeTotal,
    stripeTaxesFees,
    selectedEvent?.id,
  ]);

  const saveClassCash = useCallback(() => {
    const v = parseFloat(nashvilleCashInput);
    if (Number.isNaN(v) || v < 0 || selectedEvent == null || !isClassEvent) return;
    if (isNashvilleEvent) {
      patchNashville({ cash_override: v });
    } else {
      patchClassFinanceBase({ cash_override: v });
    }
  }, [nashvilleCashInput, selectedEvent, isClassEvent, isNashvilleEvent, patchNashville, patchClassFinanceBase]);

  const saveClassStripe = useCallback(() => {
    const v = parseFloat(nashvilleStripeInput);
    if (Number.isNaN(v) || selectedEvent == null || !isClassEvent) return;
    if (isNashvilleEvent) {
      patchNashville({ stripe_override: v });
    } else {
      patchClassFinanceBase({ stripe_override: v });
    }
  }, [nashvilleStripeInput, selectedEvent, isClassEvent, isNashvilleEvent, patchNashville, patchClassFinanceBase]);

  const saveNashvilleCash = useCallback(() => {
    saveClassCash();
  }, [saveClassCash]);

  const saveNashvilleStripe = useCallback(() => {
    saveClassStripe();
  }, [saveClassStripe]);

  const saveEventCash = useCallback(() => {
    const v = parseFloat(eventCashInput);
    if (
      !isClassEvent &&
      !Number.isNaN(v) &&
      v >= 0 &&
      selectedEvent != null
    ) {
      patchEventMetrics({ cash_total: v });
    }
  }, [eventCashInput, isClassEvent, selectedEvent, patchEventMetrics]);

  const saveEventStripe = useCallback(() => {
    const v = parseFloat(eventStripeInput);
    if (
      !isClassEvent &&
      !Number.isNaN(v) &&
      v >= 0 &&
      selectedEvent != null
    ) {
      patchEventMetrics({ stripe_total: v });
    }
  }, [eventStripeInput, isClassEvent, selectedEvent, patchEventMetrics]);

  const saveStripeFees = useCallback(() => {
    const v = parseFloat(eventStripeFeesInput);
    if (!Number.isNaN(v) && v >= 0 && selectedEvent != null) {
      patchEventMetrics({ stripe_taxes_fees_total: v });
    }
  }, [eventStripeFeesInput, selectedEvent, patchEventMetrics]);

  if (checkingAccess) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-neutral-400">Checking access…</p>
      </div>
    );
  }

  if (!canAccessFinances) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">
          Access denied
        </h1>
        <p className="mb-6 text-neutral-400">
          You don&apos;t have permission to view event finances.
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
    <div className="mx-auto w-full">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            Event finances
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            {isSocialViewer
              ? "Social event finances (read-only)"
              : "Admin-only • High-level signup and revenue by event"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isFullAdmin && (
            <Link
              href="/admin/users"
              className="text-sm text-neutral-400 transition hover:text-primary"
            >
              User roles
            </Link>
          )}
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
          {isSocialViewer ? "No Social events found." : "No events found."}
        </div>
      ) : (
        <>
          <div className="sticky top-[4.5rem] z-40 mb-4 space-y-3 rounded-xl border border-neutral-700 bg-neutral-900/95 p-3 backdrop-blur-sm lg:hidden">
            <FinancesViewTabs
              eventsView={eventsView}
              onViewChange={handleEventsViewChange}
              isFullAdmin={isFullAdmin}
              canAccessSocialOverview={canAccessSocialOverview}
            />

            {eventsView === "payments_due" && isFullAdmin ? (
              <p className="text-sm text-neutral-400">
                Unpaid instructors, social splits, workshop guests, and comp judges across all
                events.
              </p>
            ) : isYearOrAggregateView(eventsView) ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Year
                </span>
                <select
                  value={selectedYear ?? ""}
                  onChange={(e) =>
                    setSelectedYear(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a year…</option>
                  {(eventsView === "social_overview" ? socialYears : years).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                {eventsView === "past" && (
                  <PastMonthNav
                    monthLabel={pastMonthStart.format("MMMM YYYY")}
                    canGoForward={canGoForwardPastMonth}
                    onPrevious={() =>
                      setPastEventsMonth(
                        pastMonthStart.subtract(1, "month").format("YYYY-MM")
                      )
                    }
                    onNext={() =>
                      setPastEventsMonth(pastMonthStart.add(1, "month").format("YYYY-MM"))
                    }
                  />
                )}
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-neutral-500">
                    {eventsView === "upcoming" ? "Upcoming event" : "Past event"}
                  </span>
                  <select
                    value={selectedEvent?.id ?? ""}
                    onChange={(e) => {
                      const ev = displayEvents.find((item) => item.id === e.target.value);
                      if (ev) setSelectedEvent(ev);
                    }}
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {displayEvents.length === 0 ? (
                      <option value="">
                        {eventsView === "upcoming"
                          ? "No upcoming events"
                          : `No events in ${pastMonthStart.format("MMMM YYYY")}`}
                      </option>
                    ) : eventsView === "upcoming" ? (
                      groupEventsByMonth(displayEvents, "asc").map(
                        ({ monthKey, label, events: monthEvents }) => (
                          <optgroup key={monthKey} label={label}>
                            {monthEvents.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {ev.title} — {dayjs(ev.starts_at).format("MMM D, YYYY")}
                              </option>
                            ))}
                          </optgroup>
                        )
                      )
                    ) : (
                      displayEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} — {dayjs(ev.starts_at).format("MMM D, YYYY")}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </>
            )}
          </div>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="hidden rounded-xl border border-neutral-700 bg-neutral-800/30 p-2 lg:block">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              {isYearOrAggregateView(eventsView)
                ? "Year"
                : eventsView === "payments_due"
                  ? "Payments"
                  : "Events"}
            </p>
            <FinancesViewTabs
              eventsView={eventsView}
              onViewChange={handleEventsViewChange}
              isFullAdmin={isFullAdmin}
              canAccessSocialOverview={canAccessSocialOverview}
            />
            {eventsView === "payments_due" && isFullAdmin ? (
              <p className="px-2 py-4 text-sm text-neutral-400">
                Unpaid instructors, social splits, workshop guests, and comp judges across all
                events.
              </p>
            ) : eventsView === "overview" && isFullAdmin ? (
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
            ) : eventsView === "social_overview" && canAccessSocialOverview ? (
              !socialYears.length ? (
                <p className="px-2 py-4 text-center text-sm text-neutral-500">
                  No years with social events
                </p>
              ) : (
                <div className="max-h-[380px] space-y-0.5 overflow-y-auto">
                  {socialYears.map((y) => (
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
                        {socialEventCountByYear.get(y) ?? 0} social event
                        {(socialEventCountByYear.get(y) ?? 0) === 1 ? "" : "s"}
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : eventsView === "past" || eventsView === "upcoming" ? (
              <>
                {eventsView === "past" && (
                  <div className="mb-3 px-1">
                    <PastMonthNav
                      monthLabel={pastMonthStart.format("MMMM YYYY")}
                      canGoForward={canGoForwardPastMonth}
                      onPrevious={() =>
                        setPastEventsMonth(
                          pastMonthStart.subtract(1, "month").format("YYYY-MM")
                        )
                      }
                      onNext={() =>
                        setPastEventsMonth(pastMonthStart.add(1, "month").format("YYYY-MM"))
                      }
                    />
                  </div>
                )}
                {!displayEvents.length ? (
                  <p className="px-2 py-4 text-center text-sm text-neutral-500">
                    {eventsView === "upcoming"
                      ? "No upcoming events"
                      : `No events in ${pastMonthStart.format("MMMM YYYY")}`}
                  </p>
                ) : (
                  <div className="max-h-[380px] space-y-0.5 overflow-y-auto">
                    {eventsView === "upcoming"
                      ? groupEventsByMonth(displayEvents, "asc").map(
                          ({ monthKey, label, events: monthEvents }) => (
                            <div key={monthKey}>
                              <p className="sticky top-0 z-10 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 bg-neutral-800/95">
                                {label}
                              </p>
                              {monthEvents.map((ev) => (
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
                          )
                        )
                      : displayEvents.map((ev) => (
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
              </>
            ) : null}
          </div>

          <div className="min-w-0 rounded-xl border border-neutral-700 bg-neutral-800/30 p-4 sm:p-6">
            {eventsView === "payments_due" ? (
              <PaymentsDuePanel
                events={paymentsDueEvents}
                totalOutstanding={paymentsDueTotal}
                loading={loadingPaymentsDue}
                error={paymentsDueError}
                markingId={markingPaymentDueId}
                onMarkPaid={markPaymentDuePaid}
                onOpenEvent={openEventFinances}
              />
            ) : eventsView === "overview" ? (
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

                      {(overviewStats.ccsTeamTotal ?? 0) > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-yellow-500/20 bg-neutral-800/30 px-4 py-3">
                          <span className="text-sm font-medium text-neutral-300">
                            Default CCS Discount Total
                          </span>
                          <span className="text-lg font-bold text-yellow-400/90">
                            ${(overviewStats.ccsTeamTotal ?? 0).toFixed(2)}
                          </span>
                        </div>
                      )}

                      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                            <span className="text-sm font-medium text-neutral-300">
                              Gross income (collected + coupon + CCS team discounts)
                            </span>
                            <div className="flex flex-col gap-1">
                              <span className="text-lg font-bold text-primary">
                                $
                                {combinedRegistrationTotal(overviewStats).toFixed(2)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                Net collected ${netCollectedRegistrationTotal(overviewStats).toFixed(2)}
                                {(overviewStats.couponDiscountTotal ?? 0) > 0
                                  ? ` + coupon discounts $${(overviewStats.couponDiscountTotal ?? 0).toFixed(2)}`
                                  : ""}
                                {(overviewStats.ccsTeamTotal ?? 0) > 0
                                  ? ` + CCS team discount $${(overviewStats.ccsTeamTotal ?? 0).toFixed(2)}`
                                  : ""}
                              </span>
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
                            {overviewFinances.totalClassPayouts > 0 && (
                              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                  Total paid · Class payouts
                                </p>
                                <p className="mt-1 text-xl font-bold text-primary">
                                  ${overviewFinances.totalClassPayouts.toFixed(2)}
                                </p>
                              </div>
                            )}
                            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 sm:col-span-2 lg:col-span-1">
                              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Total studio rentals
                              </p>
                              <p className="mt-1 text-xl font-bold text-neutral-300">
                                ${overviewFinances.totalStudioRentals.toFixed(2)}
                              </p>
                              <p className="mt-0.5 text-xs text-neutral-500">
                                Nashville venue + workshops + comps + social venue
                              </p>
                            </div>
                            {overviewFinances.totalSocialAllocatedProfits > 0 && (
                              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 sm:col-span-2 lg:col-span-1">
                                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                  Social profit splits (planned)
                                </p>
                                <p className="mt-1 text-xl font-bold text-primary">
                                  ${overviewFinances.totalSocialAllocatedProfits.toFixed(2)}
                                </p>
                                <p className="mt-0.5 text-xs text-neutral-500">
                                  Sum of Brandon + Kyler + Isaiah from Social events
                                </p>
                              </div>
                            )}
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
                                    <span>Event revenue (collected + coupon discounts)</span>
                                    <span className="font-semibold text-white">
                                      ${combinedRegistrationTotal(overviewStats).toFixed(2)}
                                    </span>
                                  </div>
                                  {(overviewStats.couponDiscountTotal ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs text-neutral-500">
                                      <span>Net collected + coupon discounts (included above)</span>
                                      <span>
                                        ${netCollectedRegistrationTotal(overviewStats).toFixed(2)} + $
                                        {(overviewStats.couponDiscountTotal ?? 0).toFixed(2)}
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
                                      ${combinedRegistrationTotal(overviewStats).toFixed(2)}
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
                                  {overviewFinances.totalSocialAllocatedProfits > 0 && (
                                    <div className="flex items-center justify-between text-neutral-300">
                                      <span>Social splits (Brandon / Kyler / Isaiah)</span>
                                      <span className="font-semibold text-white">
                                        −${overviewFinances.totalSocialAllocatedProfits.toFixed(2)}
                                      </span>
                                    </div>
                                  )}
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
                                  {overviewFinances.totalClassPayouts > 0 && (
                                    <div className="flex items-center justify-between text-neutral-300">
                                      <span>Class payouts (generic)</span>
                                      <span className="font-semibold text-white">
                                        −${overviewFinances.totalClassPayouts.toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="my-2 border-t border-neutral-700" />
                                  <div className="flex items-center justify-between font-medium text-white">
                                    <span>Total money out</span>
                                    <span>
                                      −${(
                                        overviewFinances.totalStudioRentals +
                                        overviewFinances.totalSocialAllocatedProfits +
                                        overviewFinances.totalPaidMalissa +
                                        overviewFinances.totalPaidBt1 +
                                        overviewFinances.totalPaidBt2 +
                                        overviewFinances.totalPaidBt3 +
                                        overviewFinances.totalPaidBt4 +
                                        overviewFinances.totalPaidJudges +
                                        overviewFinances.totalClassPayouts
                                      ).toFixed(2)}
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
                                      combinedRegistrationTotal(overviewStats)
                                      - (
                                        overviewFinances.totalStudioRentals +
                                        overviewFinances.totalSocialAllocatedProfits +
                                        overviewFinances.totalPaidMalissa +
                                        overviewFinances.totalPaidBt1 +
                                        overviewFinances.totalPaidBt2 +
                                        overviewFinances.totalPaidBt3 +
                                        overviewFinances.totalPaidBt4 +
                                        overviewFinances.totalPaidJudges +
                                        overviewFinances.totalClassPayouts
                                      )
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
            ) : eventsView === "social_overview" ? (
              selectedYear == null ? (
                <p className="text-neutral-400">Select a year.</p>
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-white">
                      {selectedYear} social overview
                    </h2>
                    <p className="text-sm text-neutral-500">
                      Totals across {eventsInSelectedSocialYear.length} social event
                      {eventsInSelectedSocialYear.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {loadingSocialOverview ? (
                    <div className="flex min-h-[180px] items-center justify-center text-neutral-400">
                      Loading…
                    </div>
                  ) : socialOverviewError ? (
                    <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
                      <p className="font-medium">{socialOverviewError}</p>
                    </div>
                  ) : socialOverviewStats && socialOverviewFinances ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Signed up
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            {socialOverviewStats.totalSignups}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Checked in
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            {socialOverviewStats.checkedIn}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Cash
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            ${socialOverviewStats.cashTotal.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Stripe
                          </p>
                          <p className="mt-1 text-2xl font-bold text-white">
                            ${socialOverviewStats.stripeTotal.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                        <span className="text-sm font-medium text-neutral-300">
                          Gross income (collected + coupon + CCS team discounts)
                        </span>
                        <span className="text-lg font-bold text-primary">
                          $
                          {combinedRegistrationTotal(socialOverviewStats).toFixed(2)}
                        </span>
                      </div>

                      {socialOverviewStats.stripeTaxesFees > 0 && (
                        <div className="mt-6 rounded-lg border border-accent/30 bg-neutral-800/40 px-4 py-4">
                          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-accent">
                            Stripe taxes &amp; fees ({selectedYear})
                          </h3>
                          <p className="text-lg font-bold text-white">
                            ${socialOverviewStats.stripeTaxesFees.toFixed(2)}
                          </p>
                        </div>
                      )}

                      <h3 className="mt-8 mb-3 text-base font-semibold text-white">
                        Social payouts &amp; expenses ({selectedYear})
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Total venue cost
                          </p>
                          <p className="mt-1 text-xl font-bold text-neutral-300">
                            ${socialOverviewFinances.totalVenueCost.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Door positions
                          </p>
                          <p className="mt-1 text-xl font-bold text-neutral-300">
                            ${socialOverviewFinances.totalDoor.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Brandon (planned)
                          </p>
                          <p className="mt-1 text-xl font-bold text-primary">
                            ${socialOverviewFinances.totalBrandon.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Kyler (planned)
                          </p>
                          <p className="mt-1 text-xl font-bold text-primary">
                            ${socialOverviewFinances.totalKyler.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Isaiah (cash, capped at %)
                          </p>
                          <p className="mt-1 text-xl font-bold text-primary">
                            ${socialOverviewFinances.totalIsaiah.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            CCS (Isaiah % remainder)
                          </p>
                          <p className="mt-1 text-xl font-bold text-yellow-400">
                            ${socialOverviewFinances.totalCcs.toFixed(2)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Non-cash portion of Isaiah&apos;s share — not in money out
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            CCS-Cash (records)
                          </p>
                          <p className="mt-1 text-xl font-bold text-yellow-400">
                            ${socialOverviewFinances.totalCcsCash.toFixed(2)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Cash to CCS — not added to money out (already in splits above)
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 rounded-xl border border-primary/30 bg-neutral-800/50 p-6 ring-1 ring-primary/20">
                        <h3 className="mb-4 text-base font-semibold text-primary">
                          {selectedYear} social year summary
                        </h3>
                        <div className="space-y-4 text-sm">
                          <div>
                            <p className="mb-2 font-medium uppercase tracking-wider text-neutral-500">
                              Money in
                            </p>
                            <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                              <div className="flex items-center justify-between text-neutral-300">
                                <span>Social event revenue</span>
                                <span className="font-semibold text-white">
                                  $
                                  {(
                                    socialOverviewStats.cashTotal +
                                    socialOverviewStats.stripeTotal +
                                    (socialOverviewStats.otherTotal ?? 0) +
                                    (socialOverviewStats.ccsTeamTotal ?? 0)
                                  ).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 font-medium uppercase tracking-wider text-neutral-500">
                              Money out
                            </p>
                            <div className="space-y-1.5 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                              <div className="flex items-center justify-between text-neutral-300">
                                <span>Venue cost</span>
                                <span className="font-semibold text-white">
                                  −${socialOverviewFinances.totalVenueCost.toFixed(2)}
                                </span>
                              </div>
                              {socialOverviewFinances.totalOtherExpense > 0 && (
                                <div className="flex items-center justify-between text-neutral-300">
                                  <span>Other expenses</span>
                                  <span className="font-semibold text-white">
                                    −${socialOverviewFinances.totalOtherExpense.toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {socialOverviewFinances.totalDoor > 0 && (
                                <div className="flex items-center justify-between text-neutral-300">
                                  <span>Door positions</span>
                                  <span className="font-semibold text-white">
                                    −${socialOverviewFinances.totalDoor.toFixed(2)}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-neutral-300">
                                <span>Brandon</span>
                                <span className="font-semibold text-white">
                                  −${socialOverviewFinances.totalBrandon.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-neutral-300">
                                <span>Kyler</span>
                                <span className="font-semibold text-white">
                                  −${socialOverviewFinances.totalKyler.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-neutral-300">
                                <span>Isaiah (cash)</span>
                                <span className="font-semibold text-white">
                                  −${socialOverviewFinances.totalIsaiah.toFixed(2)}
                                </span>
                              </div>
                              <div className="my-2 border-t border-neutral-700" />
                              <div className="flex items-center justify-between font-medium text-white">
                                <span>Total money out</span>
                                <span>
                                  −$
                                  {(
                                    socialOverviewFinances.totalVenueCost +
                                    socialOverviewFinances.totalOtherExpense +
                                    socialOverviewFinances.totalSocialAllocatedProfits
                                  ).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-lg border-2 border-primary/50 bg-primary/10 px-4 py-4">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-primary">
                                Net after social payouts
                              </span>
                              <span className="text-xl font-bold text-primary">
                                $
                                {(
                                  socialOverviewStats.cashTotal +
                                  socialOverviewStats.stripeTotal +
                                  (socialOverviewStats.otherTotal ?? 0) +
                                  (socialOverviewStats.ccsTeamTotal ?? 0) -
                                  socialOverviewFinances.totalVenueCost -
                                  socialOverviewFinances.totalOtherExpense -
                                  socialOverviewFinances.totalSocialAllocatedProfits
                                ).toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-500">
                              Money in − venue − other expenses − Brandon / Kyler / Isaiah
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : eventsInSelectedSocialYear.length === 0 ? (
                    <p className="text-neutral-400">No social events in this year.</p>
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
                    {!readOnlyFinance && (
                      <button
                        type="button"
                        onClick={refreshEventMetrics}
                        disabled={refreshingEventMetrics || !authToken}
                        className="rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {refreshingEventMetrics ? "Refreshing..." : "Refresh finance numbers"}
                      </button>
                    )}
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
                      Make sure you&apos;re signed in and your session is valid. You can{" "}
                      <Link href="/auth" className="underline hover:no-underline">
                        sign in again
                      </Link>{" "}
                      or retry refreshing this event.
                    </p>
                  </div>
                ) : (
                  <>
                    {!eventMetrics && !readOnlyFinance && (
                      <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-neutral-300">
                        No saved finance metrics yet for this event. Click{" "}
                        <span className="font-medium text-primary">Refresh finance numbers</span>{" "}
                        to compute and store them.
                      </div>
                    )}
                    {!eventMetrics && readOnlyFinance && (
                      <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-neutral-300">
                        No saved finance metrics yet for this event.
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
                      {isWorkshopEvent && !isNashvilleEvent && !isCompEvent && (
                        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                            Total discount from coupons
                          </p>
                          <p className="mt-1 text-2xl font-bold text-amber-400">
                            $
                            {(workshopSignupTotals?.totalCouponDiscount ?? 0).toFixed(2)}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-400">
                            {loadingWorkshopSignups
                              ? "Loading promo breakdown…"
                              : `${workshopSignupTotals?.promoSignupCount ?? 0} signup${
                                  (workshopSignupTotals?.promoSignupCount ?? 0) === 1 ? "" : "s"
                                } with a promo code`}
                          </p>
                        </div>
                      )}
                      {isClassEvent ? (
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
                                disabled={nashvilleSaving || classFinancesSaving}
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
                                disabled={nashvilleSaving || classFinancesSaving}
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
                            {readOnlyFinance ? (
                              <p className="mt-1 text-2xl font-bold text-primary">
                                ${stats.cashTotal.toFixed(2)}
                              </p>
                            ) : (
                              <div className="mt-1 flex items-baseline gap-1">
                                <span className="text-neutral-500">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={eventCashInput}
                                  onChange={(e) => setEventCashInput(e.target.value)}
                                  onBlur={saveEventCash}
                                  disabled={eventMetricsSaving}
                                  className="w-24 rounded border border-neutral-600 bg-neutral-800 text-xl font-bold text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                                />
                              </div>
                            )}
                            <p className="mt-0.5 text-sm text-neutral-400">
                              {readOnlyFinance ? "Cash + checked in" : "Editable • Cash + checked in"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                              Stripe
                            </p>
                            {readOnlyFinance ? (
                              <p className="mt-1 text-2xl font-bold text-accent">
                                ${stats.stripeTotal.toFixed(2)}
                              </p>
                            ) : (
                              <div className="mt-1 flex items-baseline gap-1">
                                <span className="text-neutral-500">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={eventStripeInput}
                                  onChange={(e) => setEventStripeInput(e.target.value)}
                                  onBlur={saveEventStripe}
                                  disabled={eventMetricsSaving}
                                  className="w-24 rounded border border-neutral-600 bg-neutral-800 text-xl font-bold text-accent focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                                />
                              </div>
                            )}
                            <p className="mt-0.5 text-sm text-neutral-400">
                              {readOnlyFinance ? "Paid via Stripe" : "Editable • paid via Stripe"}
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

                    {(stats.ccsTeamTotal ?? 0) > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-yellow-500/20 bg-neutral-800/30 px-4 py-3">
                        <span className="text-sm font-medium text-neutral-300">
                          Default CCS Discount Total
                        </span>
                        <span className="text-lg font-bold text-yellow-400/90">
                          ${effectiveDefaultCcsDiscount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                      <span className="text-sm font-medium text-neutral-300">
                        Combined total (collected + coupon + CCS team discounts)
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-lg font-bold text-primary">
                          ${combinedTotal.toFixed(2)}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                          <span>Taxes/Fees collected via Stripe:</span>
                          {readOnlyFinance ? (
                            <span className="font-semibold text-accent">
                              ${(stats.stripeTaxesFees ?? 0).toFixed(2)}
                            </span>
                          ) : (
                            <>
                              <span className="text-neutral-500">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={eventStripeFeesInput}
                                onChange={(e) =>
                                  setEventStripeFeesInput(e.target.value)
                                }
                                onBlur={saveStripeFees}
                                disabled={eventMetricsSaving}
                                className="w-24 rounded border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-accent focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                              />
                            </>
                          )}
                          <span>(to remain in bank)</span>
                        </div>
                        {(effectiveCouponDiscount > 0 || effectiveDefaultCcsDiscount > 0) && (
                          <div className="mt-2 border-t border-neutral-600 pt-2 text-sm text-neutral-400">
                            Net collected ${netCollectedTotal.toFixed(2)}
                            {effectiveCouponDiscount > 0
                              ? ` + coupon discounts $${effectiveCouponDiscount.toFixed(2)}`
                              : ""}
                            {effectiveDefaultCcsDiscount > 0
                              ? ` + CCS team discount $${effectiveDefaultCcsDiscount.toFixed(2)}`
                              : ""}{" "}
                            (included above; not all deposited to bank)
                          </div>
                        )}
                      </div>
                    </div>

                    {isNashvilleEvent && (
                      <NashvilleBreakdown
                        effectiveCash={effectiveCash}
                        effectiveStripe={effectiveStripe}
                        stripeTaxesFees={stripeTaxesFees}
                        isClassEvent={isClassEvent}
                        instructorOptions={Array.from(
                          new Set([
                            ...financeInstructors
                              .map((i) => i.displayName?.trim())
                              .filter((n): n is string => !!n),
                            classBeginnerLeadDefault,
                            classBeginnerFollowDefault,
                            DEFAULT_UPPER_LEVEL_TEACHER,
                          ])
                        )}
                        classBeginnerLeadDefault={classBeginnerLeadDefault}
                        classBeginnerFollowDefault={classBeginnerFollowDefault}
                        nashville={nashvilleFinances}
                        loading={loadingNashville}
                        error={nashvilleError}
                        saving={nashvilleSaving}
                        onPatch={patchNashville}
                      />
                    )}

                    {isWorkshopEvent && !isNashvilleEvent && !isCompEvent && (
                      <WorkshopSignupFinanceBreakdown
                        rows={workshopSignupRows}
                        totals={
                          workshopSignupTotals ?? {
                            cash: 0,
                            stripe: 0,
                            other: 0,
                            ccsTeamCash: 0,
                            ccsTeamStripe: 0,
                            ccsTeamTotal: 0,
                            stripeTaxesFees: 0,
                            grossTotal: 0,
                            totalCouponDiscount: 0,
                            promoSignupCount: 0,
                          }
                        }
                        loading={loadingWorkshopSignups}
                        error={workshopSignupsError}
                        hasMetrics={!!eventMetrics}
                        metrics={
                          eventMetrics
                            ? {
                                cash_total: Number(eventMetrics.cash_total) || 0,
                                stripe_total: Number(eventMetrics.stripe_total) || 0,
                                other_total: Number(eventMetrics.other_total) || 0,
                                ccs_team_cash_total:
                                  Number(eventMetrics.ccs_team_cash_total) || 0,
                                ccs_team_stripe_total:
                                  Number(eventMetrics.ccs_team_stripe_total) || 0,
                                stripe_taxes_fees_total:
                                  Number(eventMetrics.stripe_taxes_fees_total) || 0,
                              }
                            : null
                        }
                      />
                    )}

                    {isGenericClassEvent && (
                      <ClassEventBreakdown
                        eventTitle={selectedEvent.title}
                        effectiveCash={effectiveCash}
                        effectiveStripe={effectiveStripe}
                        base={classFinanceBase}
                        payouts={classFinancePayouts}
                        loading={loadingClassFinances}
                        error={classFinancesError}
                        saving={classFinancesSaving}
                        onPatchBase={patchClassFinanceBase}
                        onPatchPayout={patchClassFinancePayout}
                        onAddPayout={addClassFinancePayout}
                        onDeletePayout={deleteClassFinancePayout}
                      />
                    )}

                    {isWorkshopEvent && !isCompEvent && (
                      <WorkshopBreakdown
                        computedTotalRevenue={combinedTotal}
                        defaultCcsDiscountTotal={effectiveDefaultCcsDiscount}
                        workshop={workshopFinances}
                        eventTitle={selectedEvent.title}
                        defaultStudioCost={0}
                        loading={loadingWorkshop}
                        error={workshopError}
                        saving={workshopSaving}
                        onPatch={patchWorkshop}
                      />
                    )}

                    {isCompEvent && (
                      <CompBreakdown
                        computedTotalRevenue={combinedTotal}
                        compFinances={compFinances}
                        loading={loadingCompFinances}
                        error={compFinancesError}
                        saving={compFinancesSaving}
                        onPatch={patchCompFinances}
                      />
                    )}

                    {isSocialEvent && (
                      <SocialBreakdown
                        computedTotalRevenue={combinedTotal}
                        cashTotal={stats.cashTotal}
                        stripeTotal={stats.stripeTotal}
                        otherTotal={stats.otherTotal ?? 0}
                        ccsTeamTotal={stats.ccsTeamTotal ?? 0}
                        stripeTaxesFees={stats.stripeTaxesFees ?? 0}
                        social={socialFinances}
                        doorModel={isSocialDoorPayoutModel(
                          selectedEvent?.starts_at,
                          selectedEvent?.time_zone
                        )}
                        loading={loadingSocial}
                        error={socialError}
                        saving={socialSaving}
                        readOnly={readOnlyFinance}
                        onPatch={patchSocial}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function SocialBreakdown({
  computedTotalRevenue,
  cashTotal,
  stripeTotal,
  otherTotal,
  ccsTeamTotal,
  stripeTaxesFees = 0,
  social,
  doorModel = false,
  loading,
  error,
  saving,
  readOnly = false,
  onPatch,
}: {
  computedTotalRevenue: number;
  cashTotal: number;
  stripeTotal: number;
  otherTotal: number;
  ccsTeamTotal: number;
  stripeTaxesFees?: number;
  social: TheSocialFinances | null;
  doorModel?: boolean;
  loading: boolean;
  error: string | null;
  saving: boolean;
  readOnly?: boolean;
  onPatch: (u: {
    venue_cost?: number;
    other_expense?: number;
    other_expense_comment?: string | null;
    brandon_split_ratio?: number;
    kyler_split_ratio?: number;
    isaiah_split_ratio?: number;
    brandon_profit?: number;
    kyler_profit?: number;
    mark_brandon_paid?: boolean;
    mark_kyler_paid?: boolean;
    mark_isaiah_paid?: boolean;
    door_payouts?: SocialDoorPayoutRow[];
    mark_door_paid_index?: number;
  }) => Promise<void>;
}) {
  const [venueInput, setVenueInput] = useState("0");
  const [otherExpenseInput, setOtherExpenseInput] = useState("0");
  const [otherExpenseCommentInput, setOtherExpenseCommentInput] = useState("");
  const [brandonPct, setBrandonPct] = useState("20");
  const [kylerPct, setKylerPct] = useState("30");
  const [isaiahPct, setIsaiahPct] = useState("50");
  const [brandonProfitIn, setBrandonProfitIn] = useState("0");
  const [kylerProfitIn, setKylerProfitIn] = useState("0");
  const [doorAmountInputs, setDoorAmountInputs] = useState<string[]>([]);

  useEffect(() => {
    if (social) {
      setVenueInput(String(Number(social.venue_cost)));
      setOtherExpenseInput(String(Number(social.other_expense ?? 0)));
      setOtherExpenseCommentInput(social.other_expense_comment ?? "");
      setBrandonPct(String(Math.round(Number(social.brandon_split_ratio) * 100)));
      setKylerPct(String(Math.round(Number(social.kyler_split_ratio) * 100)));
      setIsaiahPct(String(Math.round(Number(social.isaiah_split_ratio) * 100)));
      setBrandonProfitIn(String(Number(social.brandon_profit)));
      setKylerProfitIn(String(Number(social.kyler_profit)));
      const doors = normalizeDoorPayouts(social.door_payouts);
      setDoorAmountInputs(
        doors.map((d) =>
          String(
            d.amount_override != null ? d.amount_override : d.amount ?? SOCIAL_EVENT_DOOR_PAYOUT
          )
        )
      );
      return;
    }
    setVenueInput(String(DEFAULT_SOCIAL_VENUE_COST));
    setOtherExpenseInput("0");
    setOtherExpenseCommentInput("");
    setBrandonPct("20");
    setKylerPct("30");
    setIsaiahPct("50");
    setDoorAmountInputs([]);
    const split = computeSocialSplit({
      totalRevenue: computedTotalRevenue,
      cashTotal,
      venueCost: DEFAULT_SOCIAL_VENUE_COST,
      otherExpense: 0,
      brandonRatio: 0.2,
      kylerRatio: 0.3,
      isaiahRatio: 0.5,
    });
    setBrandonProfitIn(String(split.brandon_profit));
    setKylerProfitIn(String(split.kyler_profit));
  }, [social, computedTotalRevenue, cashTotal]);

  const venueNum = Math.max(0, parseFloat(venueInput) || 0);
  const otherExpenseNum = Math.max(0, parseFloat(otherExpenseInput) || 0);
  const remaining = Math.max(
    0,
    roundMoney(computedTotalRevenue - venueNum - otherExpenseNum)
  );
  const sumSplitPct =
    (parseFloat(brandonPct) || 0) + (parseFloat(kylerPct) || 0) + (parseFloat(isaiahPct) || 0);
  const splitWarning = Math.abs(sumSplitPct - 100) > 0.05;

  const bProf = parseFloat(brandonProfitIn) || 0;
  const kProf = parseFloat(kylerProfitIn) || 0;
  const splitPreview = useMemo(
    () =>
      computeSocialSplit({
        totalRevenue: computedTotalRevenue,
        cashTotal,
        venueCost: venueNum,
        otherExpense: otherExpenseNum,
        brandonRatio: (parseFloat(brandonPct) || 0) / 100,
        kylerRatio: (parseFloat(kylerPct) || 0) / 100,
        isaiahRatio: (parseFloat(isaiahPct) || 0) / 100,
        brandonProfitOverride: bProf,
        kylerProfitOverride: kProf,
      }),
    [
      computedTotalRevenue,
      cashTotal,
      venueNum,
      otherExpenseNum,
      brandonPct,
      kylerPct,
      isaiahPct,
      bProf,
      kProf,
    ]
  );
  const iProf = splitPreview.isaiah_profit;
  const ccsProf = splitPreview.ccs_profit;
  const ccsCashProf = splitPreview.ccs_cash_profit;
  const isaiahNominal = splitPreview.isaiah_nominal;
  const cashPayoutSum = roundMoney(bProf + kProf + iProf + ccsCashProf);
  const cashReconciliation = roundMoney(cashTotal - cashPayoutSum);
  const totalExpenses = roundMoney(venueNum + otherExpenseNum);
  const totalPayouts = roundMoney(bProf + kProf + iProf + ccsProf);
  const reconciliationDiff = roundMoney(computedTotalRevenue - totalExpenses - totalPayouts);

  const expenseLines = useMemo(() => {
    const lines: { label: string; value: number }[] = [
      { label: "Venue cost", value: venueNum },
    ];
    if (otherExpenseNum > 0) {
      const comment = otherExpenseCommentInput.trim();
      lines.push({
        label: comment ? `Other expense (${comment})` : "Other expense",
        value: otherExpenseNum,
      });
    }
    return lines;
  }, [venueNum, otherExpenseNum, otherExpenseCommentInput]);

  const payoutLines = useMemo(
    () => [
      { label: "Brandon", value: bProf },
      { label: "Kyler", value: kProf },
      { label: "Isaiah (cash)", value: iProf },
      { label: "CCS (Isaiah % remainder)", value: ccsProf },
    ],
    [bProf, kProf, iProf, ccsProf]
  );

  const saveVenue = useCallback(() => {
    const v = parseFloat(venueInput);
    if (!Number.isNaN(v) && v >= 0) onPatch({ venue_cost: roundMoney(v) });
  }, [venueInput, onPatch]);

  const saveOtherExpense = useCallback(() => {
    const trimmed = otherExpenseInput.trim();
    const v = trimmed === "" ? 0 : parseFloat(trimmed);
    if (!Number.isNaN(v) && v >= 0) onPatch({ other_expense: roundMoney(v) });
  }, [otherExpenseInput, onPatch]);

  const saveOtherExpenseComment = useCallback(() => {
    onPatch({ other_expense_comment: otherExpenseCommentInput.trim() || null });
  }, [otherExpenseCommentInput, onPatch]);

  const saveSplits = useCallback(() => {
    const b = (parseFloat(brandonPct) || 0) / 100;
    const k = (parseFloat(kylerPct) || 0) / 100;
    const i = (parseFloat(isaiahPct) || 0) / 100;
    if (![b, k, i].every((x) => x >= 0 && x <= 1)) return;
    onPatch({
      brandon_split_ratio: Number(b.toFixed(6)),
      kyler_split_ratio: Number(k.toFixed(6)),
      isaiah_split_ratio: Number(i.toFixed(6)),
    });
  }, [brandonPct, kylerPct, isaiahPct, onPatch]);

  const saveBrandonProfit = useCallback(() => {
    const v = parseFloat(brandonProfitIn);
    if (!Number.isNaN(v) && v >= 0) onPatch({ brandon_profit: roundMoney(v) });
  }, [brandonProfitIn, onPatch]);
  const saveKylerProfit = useCallback(() => {
    const v = parseFloat(kylerProfitIn);
    if (!Number.isNaN(v) && v >= 0) onPatch({ kyler_profit: roundMoney(v) });
  }, [kylerProfitIn, onPatch]);

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-neutral-700 bg-neutral-800/30 px-4 py-8 text-center text-neutral-400">
        Loading social breakdown…
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

  if (doorModel) {
    const doorRows = normalizeDoorPayouts(social?.door_payouts);
    const doorRowsForCalc = doorRows.map((d, i) => {
      const parsed = parseFloat(doorAmountInputs[i] ?? "");
      return {
        ...d,
        amount_override: Number.isFinite(parsed) ? parsed : d.amount_override,
      };
    });
    const doorPayouts = computeSocialDoorPayouts({
      cashTotal,
      stripeTotal,
      venueCost: venueNum,
      otherExpense: otherExpenseNum,
      doorRows: doorRowsForCalc,
    });
    const ccsTotal = roundMoney(doorPayouts.isaiahCash + doorPayouts.ccsElectronic);
    const totalRevenue = roundMoney(cashTotal + stripeTotal);
    const allocationItems: { label: string; value: number }[] = [
      { label: "Venue cost", value: venueNum },
    ];
    if (otherExpenseNum > 0) {
      const comment = otherExpenseCommentInput.trim();
      allocationItems.push({
        label: comment ? `Other expense (${comment})` : "Other expense",
        value: otherExpenseNum,
      });
    }
    doorRows.forEach((door, index) => {
      const amt = doorPayouts.doorAmounts[index] ?? effectiveDoorAmount(door);
      allocationItems.push({
        label: `${door.name || `Doorman ${index + 1}`} (cash)`,
        value: amt,
      });
    });
    allocationItems.push(
      { label: "Cash → Isaiah", value: doorPayouts.isaiahCash },
      { label: "Electronic → CCS", value: doorPayouts.ccsElectronic }
    );
    const allocationsTotal = roundMoney(
      allocationItems.reduce((sum, item) => sum + item.value, 0)
    );
    const reconciliationDiff = roundMoney(totalRevenue - allocationsTotal);

    return (
      <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
        <h3 className="mb-4 text-base font-semibold text-primary">
          Social — Payout breakdown
        </h3>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-neutral-300">Venue cost</label>
            {readOnly ? (
              <span className="text-lg font-bold text-white">${venueNum.toFixed(2)}</span>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-neutral-500">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={venueInput}
                  onChange={(e) => setVenueInput(e.target.value)}
                  onBlur={saveVenue}
                  disabled={saving}
                  className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-neutral-700/80 bg-neutral-800/40 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-neutral-300">Other expense</label>
              {readOnly ? (
                <span className="text-lg font-bold text-white">${otherExpenseNum.toFixed(2)}</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-neutral-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={otherExpenseInput}
                    onChange={(e) => setOtherExpenseInput(e.target.value)}
                    onBlur={saveOtherExpense}
                    disabled={saving}
                    className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">
                Comment (what was this expense for?)
              </label>
              {readOnly ? (
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                  {otherExpenseCommentInput.trim() ? otherExpenseCommentInput : "—"}
                </p>
              ) : (
                <textarea
                  rows={2}
                  value={otherExpenseCommentInput}
                  onChange={(e) => setOtherExpenseCommentInput(e.target.value)}
                  onBlur={saveOtherExpenseComment}
                  disabled={saving}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
              )}
            </div>
          </div>

          <p className="text-sm text-neutral-400">
            Profit after venue &amp; other:{" "}
            <span className="font-semibold text-white">${doorPayouts.profit.toFixed(2)}</span>
          </p>

          <h4 className="pt-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Door positions
          </h4>
          {doorRows.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No filled Doorman slots on the schedule yet. Names auto-fill when someone
              signs up. If slots are already filled, apply the{" "}
              <code className="text-neutral-400">door_payouts</code> migration and refresh.
            </p>
          ) : (
            doorRows.map((door, index) => (
              <SocialPersonRow
                key={door.slot_id ?? index}
                label={door.name || `Doorman ${index + 1}`}
                profitInput={doorAmountInputs[index] ?? String(SOCIAL_EVENT_DOOR_PAYOUT)}
                onProfitChange={(s) => {
                  setDoorAmountInputs((prev) => {
                    const next = [...prev];
                    next[index] = s;
                    return next;
                  });
                }}
                onProfitBlur={() => {
                  const parsed = parseFloat(doorAmountInputs[index] ?? "");
                  const patched = doorRows.map((d, i) => {
                    if (i !== index) return d;
                    return {
                      ...d,
                      amount: SOCIAL_EVENT_DOOR_PAYOUT,
                      amount_override: Number.isFinite(parsed) ? roundMoney(parsed) : null,
                    };
                  });
                  onPatch({ door_payouts: patched });
                }}
                paidAt={door.paid_at ?? null}
                onMarkPaid={() => onPatch({ mark_door_paid_index: index })}
                saving={saving}
                readOnly={readOnly}
                subtitle={`Door payout (default $${SOCIAL_EVENT_DOOR_PAYOUT}, paid from cash)`}
              />
            ))
          )}

          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">CCS total</p>
            <p className="mt-1 text-2xl font-bold text-white">${ccsTotal.toFixed(2)}</p>
            <p className="mt-2 text-sm text-neutral-300">
              Cash → Isaiah: ${doorPayouts.isaiahCash.toFixed(2)}
            </p>
            <p className="text-sm text-neutral-300">
              Electronic → CCS: ${doorPayouts.ccsElectronic.toFixed(2)}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Allocation summary
            </h4>
            <ul className="space-y-2 text-sm">
              {allocationItems.map((item) => (
                <li key={item.label} className="flex items-center justify-between text-neutral-300">
                  <span>{item.label}</span>
                  <span className="font-medium text-white">${item.value.toFixed(2)}</span>
                </li>
              ))}
              <li className="mt-2 flex items-center justify-between border-t border-neutral-700 pt-2 font-medium text-white">
                <span>Total allocated</span>
                <span>${allocationsTotal.toFixed(2)}</span>
              </li>
              {Math.abs(reconciliationDiff) > 0.01 && (
                <li className="flex items-center justify-between text-primary">
                  <span>Reconciliation difference</span>
                  <span>${reconciliationDiff.toFixed(2)}</span>
                </li>
              )}
            </ul>
          </div>

          {stripeTaxesFees > 0 && (
            <div className="flex items-center justify-between text-neutral-300">
              <span>Taxes/Fees (to remain in bank)</span>
              <span className="font-semibold text-accent">${stripeTaxesFees.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
      <h3 className="mb-4 text-base font-semibold text-primary">Social breakdown</h3>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Venue cost</label>
          {readOnly ? (
            <span className="text-lg font-bold text-white">${venueNum.toFixed(2)}</span>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-neutral-500">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={venueInput}
                onChange={(e) => setVenueInput(e.target.value)}
                onBlur={saveVenue}
                disabled={saving}
                className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-neutral-700/80 bg-neutral-800/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-neutral-300">Other expense</label>
            {readOnly ? (
              <span className="text-lg font-bold text-white">${otherExpenseNum.toFixed(2)}</span>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-neutral-500">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={otherExpenseInput}
                  onChange={(e) => setOtherExpenseInput(e.target.value)}
                  onBlur={saveOtherExpense}
                  disabled={saving}
                  className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Comment (what was this expense for?)
            </label>
            {readOnly ? (
              <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                {otherExpenseCommentInput.trim()
                  ? otherExpenseCommentInput
                  : "—"}
              </p>
            ) : (
              <textarea
                rows={2}
                value={otherExpenseCommentInput}
                onChange={(e) => setOtherExpenseCommentInput(e.target.value)}
                onBlur={saveOtherExpenseComment}
                disabled={saving}
                placeholder="e.g. Supplies, DJ fee, etc."
                className="w-full max-w-xl rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-300">Distributable</span>
          <span className="text-lg font-bold text-white">${remaining.toFixed(2)}</span>
          <span className="text-xs text-neutral-500">
            (Combined revenue − Venue cost − Other expense)
          </span>
        </div>

        {splitWarning && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">
            Split percentages sum to {sumSplitPct.toFixed(1)}% (expected 100% for a full default split).
          </p>
        )}

        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            {readOnly ? "Default shares" : "Default shares (editable)"}
          </p>
          {readOnly ? (
            <div className="flex flex-wrap gap-6 text-sm text-neutral-300">
              <span>Brandon: {brandonPct}%</span>
              <span>Kyler: {kylerPct}%</span>
              <span>Isaiah: {isaiahPct}%</span>
            </div>
          ) : (
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Brandon %</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={brandonPct}
                onChange={(e) => setBrandonPct(e.target.value)}
                onBlur={saveSplits}
                disabled={saving}
                className="w-20 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Kyler %</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={kylerPct}
                onChange={(e) => setKylerPct(e.target.value)}
                onBlur={saveSplits}
                disabled={saving}
                className="w-20 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Isaiah %</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={isaiahPct}
                onChange={(e) => setIsaiahPct(e.target.value)}
                onBlur={saveSplits}
                disabled={saving}
                className="w-20 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-white disabled:opacity-60"
              />
            </div>
          </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <SocialPersonRow
          label="Brandon"
          profitInput={brandonProfitIn}
          onProfitChange={setBrandonProfitIn}
          onProfitBlur={saveBrandonProfit}
          paidAt={social?.brandon_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_brandon_paid: true })}
          saving={saving}
          readOnly={readOnly}
        />
        <SocialPersonRow
          label="Kyler"
          profitInput={kylerProfitIn}
          onProfitChange={setKylerProfitIn}
          onProfitBlur={saveKylerProfit}
          paidAt={social?.kyler_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_kyler_paid: true })}
          saving={saving}
          readOnly={readOnly}
        />
        <SocialPersonRow
          label="Isaiah"
          profitInput={String(iProf)}
          onProfitChange={() => {}}
          onProfitBlur={() => {}}
          paidAt={social?.isaiah_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_isaiah_paid: true })}
          saving={saving}
          amountReadOnly
          readOnly={readOnly}
          subtitle={`Cash toward Isaiah (max ${isaiahNominal.toFixed(2)} at ${isaiahPct}% of distributable)`}
        />
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-yellow-500/30 bg-neutral-800/50 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-yellow-500/90">CCS</p>
            <p className="mt-1 text-xl font-semibold text-yellow-400">${ccsProf.toFixed(2)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Non-cash portion of Isaiah&apos;s share (nominal ${isaiahNominal.toFixed(2)} − cash to Isaiah)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-yellow-500/30 bg-neutral-800/50 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-yellow-500/90">CCS-Cash</p>
            <p className="mt-1 text-xl font-semibold text-yellow-400">${ccsCashProf.toFixed(2)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Cash left after Brandon, Kyler, and Isaiah are paid
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
          Itemized reconciliation
        </p>
        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Total income
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-neutral-300">
                <span>Cash</span>
                <span className="font-semibold text-white">${cashTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-300">
                <span>Stripe</span>
                <span className="font-semibold text-white">${stripeTotal.toFixed(2)}</span>
              </div>
              {otherTotal > 0 && (
                <div className="flex items-center justify-between text-neutral-300">
                  <span>Other</span>
                  <span className="font-semibold text-white">${otherTotal.toFixed(2)}</span>
                </div>
              )}
              {ccsTeamTotal > 0 && (
                <div className="flex items-center justify-between text-neutral-300">
                  <span>CCS TEAM</span>
                  <span className="font-semibold text-white">${ccsTeamTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="my-2 border-t border-neutral-800" />
              <div className="flex items-center justify-between font-medium text-white">
                <span>Total income</span>
                <span>${computedTotalRevenue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Expenses
            </p>
            <div className="space-y-2">
              {expenseLines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between text-neutral-300"
                >
                  <span>{line.label}</span>
                  <span className="font-semibold text-white">−${line.value.toFixed(2)}</span>
                </div>
              ))}
              <div className="my-2 border-t border-neutral-800" />
              <div className="flex items-center justify-between font-medium text-white">
                <span>Total expenses</span>
                <span>−${totalExpenses.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-neutral-700/80 bg-neutral-800/40 px-3 py-2 text-neutral-300">
            <span>Distributable (income − expenses)</span>
            <span className="font-semibold text-white">${remaining.toFixed(2)}</span>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Payouts
            </p>
            <div className="space-y-2">
              {payoutLines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between text-neutral-300"
                >
                  <span>{line.label}</span>
                  <span
                    className={`font-semibold ${
                      line.label.startsWith("CCS") ? "text-yellow-400" : "text-primary"
                    }`}
                  >
                    ${line.value.toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="my-2 border-t border-neutral-800" />
              <div className="flex items-center justify-between font-medium text-white">
                <span>Total payouts</span>
                <span>${totalPayouts.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="my-2 border-t border-neutral-800" />
          <div className="flex items-center justify-between">
            <span className="text-neutral-300">Income − expenses − payouts</span>
            <span
              className={`font-semibold ${
                Math.abs(reconciliationDiff) < 0.02 ? "text-emerald-400" : "text-amber-300"
              }`}
            >
              ${reconciliationDiff.toFixed(2)}
            </span>
          </div>

          <div className="rounded-lg border border-neutral-700/80 bg-neutral-800/30 p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Cash only
            </p>
            <div className="flex items-center justify-between text-neutral-300">
              <span>Cash collected</span>
              <span className="font-semibold text-white">${cashTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-neutral-300">
              <span>Cash payouts (Brandon + Kyler + Isaiah + CCS-Cash)</span>
              <span className="font-semibold text-white">${cashPayoutSum.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Cash remaining</span>
              <span
                className={`font-semibold ${
                  Math.abs(cashReconciliation) < 0.02 ? "text-emerald-400" : "text-amber-300"
                }`}
              >
                ${cashReconciliation.toFixed(2)}
              </span>
            </div>
          </div>

          {stripeTaxesFees > 0 && (
            <div className="flex items-center justify-between text-neutral-300">
              <span>Taxes/Fees (to remain in bank)</span>
              <span className="font-semibold text-accent">${stripeTaxesFees.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SocialPersonRow({
  label,
  profitInput,
  onProfitChange,
  onProfitBlur,
  paidAt,
  onMarkPaid,
  saving,
  readOnly = false,
  amountReadOnly = false,
  subtitle,
}: {
  label: string;
  profitInput: string;
  onProfitChange: (s: string) => void;
  onProfitBlur: () => void;
  paidAt: string | null;
  onMarkPaid: () => void;
  saving: boolean;
  /** Disables Mark paid (e.g. social_viewer). */
  readOnly?: boolean;
  /** Shows amount as text only (e.g. computed Isaiah payout). */
  amountReadOnly?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>
        {amountReadOnly ? (
          <p className="mt-1 text-xl font-semibold text-white">
            ${(parseFloat(profitInput) || 0).toFixed(2)}
          </p>
        ) : (
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={profitInput}
              onChange={(e) => onProfitChange(e.target.value)}
              onBlur={onProfitBlur}
              disabled={saving}
              className="w-32 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 font-semibold text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          {subtitle ??
            (amountReadOnly ? "Profit allocation" : "Profit allocation (editable)")}
        </p>
      </div>
      <div className="shrink-0">
        {paidAt ? (
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-center">
            <p className="text-xs font-medium text-primary">Paid</p>
            <p className="text-xs text-neutral-400">{dayjs(paidAt).format("MMM D, YYYY")}</p>
          </div>
        ) : readOnly ? (
          <div className="rounded-lg border border-neutral-600 bg-neutral-800/80 px-3 py-2 text-center">
            <p className="text-xs font-medium text-neutral-400">Unpaid</p>
          </div>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={onMarkPaid}
            className="rounded-lg border border-primary/60 bg-primary/15 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
          >
            Mark paid
          </button>
        )}
      </div>
    </div>
  );
}

function WorkshopBreakdown({
  computedTotalRevenue,
  defaultCcsDiscountTotal = 0,
  workshop,
  eventTitle,
  defaultStudioCost,
  loading,
  error,
  saving,
  onPatch,
}: {
  computedTotalRevenue: number;
  defaultCcsDiscountTotal?: number;
  workshop: WorkshopFinances | null;
  eventTitle: string;
  defaultStudioCost: number;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onPatch: (u: {
    studio_cost?: number;
    total_override?: number | null;
    guest_instructor_amount?: number | null;
    ccs_amount?: number | null;
    mark_guest_instructor_paid?: boolean;
  }) => Promise<void>;
}) {
  const effectiveTotalRevenue =
    workshop?.total_override != null ? Number(workshop.total_override) : computedTotalRevenue;
  const studioCost =
    workshop?.studio_cost != null ? Number(workshop.studio_cost) : defaultStudioCost;
  const remaining = Math.max(0, effectiveTotalRevenue - studioCost);
  const defaultGuest = Math.round(remaining * 0.9 * 100) / 100;
  const defaultCcs = Math.round(remaining * 0.1 * 100) / 100;
  const guestInstructorAmount =
    workshop?.guest_instructor_amount != null
      ? Number(workshop.guest_instructor_amount)
      : defaultGuest;
  const ccsAmount =
    workshop?.ccs_amount != null ? Number(workshop.ccs_amount) : defaultCcs;
  const finalGuestInstructorAmount =
    guestInstructorAmount + defaultCcsDiscountTotal;
  const finalCcsAmount = Math.max(0, ccsAmount - defaultCcsDiscountTotal);

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
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Raw split (90% / 10%)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">
            Guest Instructor (90%{defaultCcsDiscountTotal > 0 ? ", raw" : ""})
          </label>
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
          <label className="text-sm font-medium text-neutral-300">
            CCS (10%{defaultCcsDiscountTotal > 0 ? ", raw" : ""})
          </label>
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

        {defaultCcsDiscountTotal > 0 && (
          <div className="space-y-2 rounded-lg border border-yellow-500/20 bg-neutral-900/40 p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-yellow-500/90">
              CCS team discount adjustment
            </p>
            <div className="flex items-center justify-between text-neutral-300">
              <span>Guest Instructor (90%, raw)</span>
              <span className="tabular-nums">${guestInstructorAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-neutral-300">
              <span>CCS (10%, raw)</span>
              <span className="tabular-nums">${ccsAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-yellow-400/90">
              <span>Default CCS Discount Total</span>
              <span className="tabular-nums font-medium">
                +${defaultCcsDiscountTotal.toFixed(2)} to guest / −$
                {defaultCcsDiscountTotal.toFixed(2)} from CCS
              </span>
            </div>
            <div className="my-2 border-t border-neutral-700" />
            <div className="flex items-center justify-between font-medium text-white">
              <span>Guest Instructor (final)</span>
              <span className="tabular-nums text-yellow-400">
                ${finalGuestInstructorAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between font-medium text-white">
              <span>CCS (final)</span>
              <span className="tabular-nums text-primary">${finalCcsAmount.toFixed(2)}</span>
            </div>
          </div>
        )}

        {finalGuestInstructorAmount > 0.01 && (
          <PayableRow
            payeeName={guestInstructorNameFromEventTitle(eventTitle)}
            roleLabel="Guest instructor"
            amount={finalGuestInstructorAmount}
            paidAt={workshop?.guest_instructor_paid_at ?? null}
            onMarkPaid={() => onPatch({ mark_guest_instructor_paid: true })}
            saving={saving}
          />
        )}
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
            <span>Guest Instructor (90%{defaultCcsDiscountTotal > 0 ? ", raw" : ""})</span>
            <span className="font-semibold text-yellow-400">${guestInstructorAmount.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-300">
            <span>CCS (10%{defaultCcsDiscountTotal > 0 ? ", raw" : ""})</span>
            <span className="font-semibold text-primary">${ccsAmount.toFixed(2)}</span>
          </div>
          {defaultCcsDiscountTotal > 0 && (
            <>
              <div className="flex items-center justify-between text-yellow-400/90">
                <span>Default CCS Discount Total</span>
                <span className="font-semibold">
                  +${defaultCcsDiscountTotal.toFixed(2)} guest / −$
                  {defaultCcsDiscountTotal.toFixed(2)} CCS
                </span>
              </div>
              <div className="my-2 border-t border-neutral-800" />
              <div className="flex items-center justify-between text-neutral-300">
                <span>Guest Instructor (final)</span>
                <span className="font-semibold text-yellow-400">
                  ${finalGuestInstructorAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-300">
                <span>CCS (final)</span>
                <span className="font-semibold text-primary">${finalCcsAmount.toFixed(2)}</span>
              </div>
            </>
          )}
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
  isClassEvent,
  instructorOptions,
  classBeginnerLeadDefault,
  classBeginnerFollowDefault,
  nashville,
  loading,
  error,
  saving,
  onPatch,
}: {
  effectiveCash: number;
  effectiveStripe: number;
  stripeTaxesFees: number;
  isClassEvent: boolean;
  instructorOptions: string[];
  classBeginnerLeadDefault: string;
  classBeginnerFollowDefault: string;
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
  const bt1Fallback = isClassEvent ? classBeginnerLeadDefault : "Beginner Teacher 1";
  const bt2Fallback = isClassEvent ? classBeginnerFollowDefault : "Beginner Teacher 2";
  const upperFallback = DEFAULT_UPPER_LEVEL_TEACHER;
  const [bt1Name, setBt1Name] = useState(nashville?.bt1_name ?? bt1Fallback);
  const [bt2Name, setBt2Name] = useState(nashville?.bt2_name ?? bt2Fallback);
  const [bt3Name, setBt3Name] = useState(nashville?.bt3_name ?? "Beginner Teacher 3");
  const [bt4Name, setBt4Name] = useState(nashville?.bt4_name ?? "Beginner Teacher 4");
  const [malissaName, setMalissaName] = useState(
    nashville?.upper_level_teacher_name ?? upperFallback
  );
  const [bt1PayoutInput, setBt1PayoutInput] = useState("");
  const [bt2PayoutInput, setBt2PayoutInput] = useState("");
  const [bt3PayoutInput, setBt3PayoutInput] = useState("");
  const [bt4PayoutInput, setBt4PayoutInput] = useState("");
  const [malissaPayoutInput, setMalissaPayoutInput] = useState("");
  const [payoutOverrideError, setPayoutOverrideError] = useState<string | null>(null);

  const classTeacherOptions = useMemo(() => {
    if (!isClassEvent) return undefined;
    return Array.from(
      new Set(
        [
          ...instructorOptions,
          bt1Name,
          bt2Name,
          malissaName,
          nashville?.bt1_name ?? "",
          nashville?.bt2_name ?? "",
          nashville?.upper_level_teacher_name ?? "",
          bt1Fallback,
          bt2Fallback,
          upperFallback,
        ]
          .map((s) => String(s || "").trim())
          .filter(Boolean)
      )
    );
  }, [
    isClassEvent,
    instructorOptions,
    bt1Name,
    bt2Name,
    malissaName,
    nashville?.bt1_name,
    nashville?.bt2_name,
    nashville?.upper_level_teacher_name,
    bt1Fallback,
    bt2Fallback,
    upperFallback,
  ]);

  useEffect(() => {
    setVenueInput(String(nashville?.venue_cost ?? 0));
    setBt1Name(nashville?.bt1_name ?? bt1Fallback);
    setBt2Name(nashville?.bt2_name ?? bt2Fallback);
    setBt3Name(nashville?.bt3_name ?? "Beginner Teacher 3");
    setBt4Name(nashville?.bt4_name ?? "Beginner Teacher 4");
    setMalissaName(nashville?.upper_level_teacher_name ?? upperFallback);
  }, [
    nashville?.venue_cost,
    nashville?.bt1_name,
    nashville?.bt2_name,
    nashville?.bt3_name,
    nashville?.bt4_name,
    nashville?.upper_level_teacher_name,
    bt1Fallback,
    bt2Fallback,
    upperFallback,
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
    if (s && s !== (nashville?.bt1_name ?? bt1Fallback)) onPatch({ bt1_name: s });
  };
  const saveBt2Name = () => {
    const s = bt2Name.trim();
    if (s && s !== (nashville?.bt2_name ?? bt2Fallback)) onPatch({ bt2_name: s });
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
    if (s && s !== (nashville?.upper_level_teacher_name ?? upperFallback)) onPatch({ upper_level_teacher_name: s });
  };

  const normalizeTeacherName = (value: string) => value.trim().toLowerCase();
  const bt1ScheduleMatch = useMemo(
    () => normalizeTeacherName(bt1Name) === normalizeTeacherName(classBeginnerLeadDefault),
    [bt1Name, classBeginnerLeadDefault]
  );
  const bt2ScheduleMatch = useMemo(
    () => normalizeTeacherName(bt2Name) === normalizeTeacherName(classBeginnerFollowDefault),
    [bt2Name, classBeginnerFollowDefault]
  );
  const bt1Label = isClassEvent ? (
    <span className="inline-flex items-center gap-2">
      <span>Beginner Teacher 1</span>
      <span
        className={bt1ScheduleMatch ? "text-emerald-500/80" : "text-red-500/80"}
        title={bt1ScheduleMatch ? "Matches schedule assignment" : "Does not match schedule assignment"}
        aria-label={bt1ScheduleMatch ? "Matches schedule assignment" : "Does not match schedule assignment"}
      >
        {bt1ScheduleMatch ? "✓" : "✗"}
      </span>
    </span>
  ) : (
    "Beginner Teacher 1"
  );
  const bt2Label = isClassEvent ? (
    <span className="inline-flex items-center gap-2">
      <span>Beginner Teacher 2</span>
      <span
        className={bt2ScheduleMatch ? "text-emerald-500/80" : "text-red-500/80"}
        title={bt2ScheduleMatch ? "Matches schedule assignment" : "Does not match schedule assignment"}
        aria-label={bt2ScheduleMatch ? "Matches schedule assignment" : "Does not match schedule assignment"}
      >
        {bt2ScheduleMatch ? "✓" : "✗"}
      </span>
    </span>
  ) : (
    "Beginner Teacher 2"
  );

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
          label={bt1Label}
          name={bt1Name}
          onNameChange={setBt1Name}
          onNameBlur={saveBt1Name}
          nameOptions={classTeacherOptions}
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
          label={bt2Label}
          name={bt2Name}
          onNameChange={setBt2Name}
          onNameBlur={saveBt2Name}
          nameOptions={classTeacherOptions}
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
          nameOptions={classTeacherOptions}
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

function ClassTeacherAssignments({
  nashville,
  instructors,
  leadDefault,
  followDefault,
  saving,
  onPatch,
}: {
  nashville: NashvilleFinances | null;
  instructors: InstructorOption[];
  leadDefault: string;
  followDefault: string;
  saving: boolean;
  onPatch: (u: {
    bt1_name?: string;
    bt2_name?: string;
    upper_level_teacher_name?: string;
  }) => Promise<void>;
}) {
  const [bt1Name, setBt1Name] = useState("");
  const [bt2Name, setBt2Name] = useState("");
  const [upperName, setUpperName] = useState("");

  useEffect(() => {
    setBt1Name(nashville?.bt1_name ?? leadDefault);
  }, [nashville?.bt1_name, leadDefault]);

  useEffect(() => {
    setBt2Name(nashville?.bt2_name ?? followDefault);
  }, [nashville?.bt2_name, followDefault]);

  useEffect(() => {
    setUpperName(nashville?.upper_level_teacher_name ?? DEFAULT_UPPER_LEVEL_TEACHER);
  }, [nashville?.upper_level_teacher_name]);

  const options = useMemo(() => {
    const names = instructors
      .filter((i) => isCcsInstructorRole(i.role))
      .map((i) => i.displayName?.trim())
      .filter((n): n is string => !!n);
    const extras = [leadDefault, followDefault, DEFAULT_UPPER_LEVEL_TEACHER];
    return Array.from(new Set([...names, ...extras]));
  }, [instructors, leadDefault, followDefault]);

  const saveBt1 = useCallback(() => {
    const s = bt1Name.trim();
    if (s && s !== (nashville?.bt1_name ?? leadDefault)) {
      onPatch({ bt1_name: s });
    }
  }, [bt1Name, nashville?.bt1_name, leadDefault, onPatch]);

  const saveBt2 = useCallback(() => {
    const s = bt2Name.trim();
    if (s && s !== (nashville?.bt2_name ?? followDefault)) {
      onPatch({ bt2_name: s });
    }
  }, [bt2Name, nashville?.bt2_name, followDefault, onPatch]);

  const saveUpper = useCallback(() => {
    const s = upperName.trim();
    const current = nashville?.upper_level_teacher_name ?? DEFAULT_UPPER_LEVEL_TEACHER;
    if (s && s !== current) {
      onPatch({ upper_level_teacher_name: s });
    }
  }, [upperName, nashville?.upper_level_teacher_name, onPatch]);

  return (
    <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
      <h3 className="mb-4 text-base font-semibold text-primary">
        Class teacher assignments
      </h3>
      <p className="mb-4 text-sm text-neutral-400">
        Beginner Teacher defaults come from this week&apos;s instructor schedule.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Beginner Teacher 1
          </label>
          <select
            value={bt1Name}
            onChange={(e) => setBt1Name(e.target.value)}
            onBlur={saveBt1}
            disabled={saving}
            className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          >
            {options.map((name) => (
              <option key={`bt1-${name}`} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Beginner Teacher 2
          </label>
          <select
            value={bt2Name}
            onChange={(e) => setBt2Name(e.target.value)}
            onBlur={saveBt2}
            disabled={saving}
            className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          >
            {options.map((name) => (
              <option key={`bt2-${name}`} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Upper Level Teacher
          </label>
          <select
            value={upperName}
            onChange={(e) => setUpperName(e.target.value)}
            onBlur={saveUpper}
            disabled={saving}
            className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          >
            {options.map((name) => (
              <option key={`upper-${name}`} value={name}>
                {name}
              </option>
            ))}
          </select>
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
  nameOptions,
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
  label: ReactNode;
  name: string;
  onNameChange: (s: string) => void;
  onNameBlur: () => void;
  nameOptions?: string[];
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
        {nameOptions && nameOptions.length > 0 ? (
          <select
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={onNameBlur}
            disabled={saving}
            className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          >
            {nameOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={onNameBlur}
            disabled={saving}
            className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
        )}
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

function PayableRow({
  payeeName,
  roleLabel,
  amount,
  paidAt,
  onMarkPaid,
  saving,
}: {
  payeeName: string;
  roleLabel?: string;
  amount: number;
  paidAt: string | null;
  onMarkPaid: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          {roleLabel ?? "Payee"}
        </p>
        <p className="mt-1 text-lg font-semibold text-white">{payeeName}</p>
        <p className="mt-1 text-xl font-bold text-primary">${amount.toFixed(2)}</p>
      </div>
      <div className="shrink-0">
        {paidAt ? (
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-center">
            <p className="text-xs font-medium text-primary">Paid</p>
            <p className="text-xs text-neutral-400">{dayjs(paidAt).format("MMM D, YYYY")}</p>
          </div>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={onMarkPaid}
            className="rounded-lg border border-primary/60 bg-primary/15 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
          >
            Mark paid
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentsDuePanel({
  events,
  totalOutstanding,
  loading,
  error,
  markingId,
  onMarkPaid,
  onOpenEvent,
}: {
  events: PaymentsDueByEvent[] | null;
  totalOutstanding: number;
  loading: boolean;
  error: string | null;
  markingId: string | null;
  onMarkPaid: (row: PaymentDueRow) => void;
  onOpenEvent: (eventId: string, eventStart: string | null) => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-neutral-400">
        Loading payments due…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
        {error}
      </div>
    );
  }

  const eventList = events ?? [];
  const hasRows = eventList.some((ev) => ev.rows.length > 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Payments due</h2>
          <p className="text-sm text-neutral-500">
            Unpaid instructors, social splits, workshop guests, and comp judges
          </p>
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Total outstanding
          </p>
          <p className="text-2xl font-bold text-primary">${totalOutstanding.toFixed(2)}</p>
        </div>
      </div>

      {!hasRows ? (
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-6 py-12 text-center">
          <p className="text-lg font-medium text-white">All caught up</p>
          <p className="mt-2 text-sm text-neutral-400">No outstanding payments.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {eventList.map((ev) => (
            <section
              key={ev.eventId}
              className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-4"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{ev.eventTitle}</h3>
                  {ev.eventStart && (
                    <p className="mt-0.5 text-sm text-neutral-500">
                      {dayjs(ev.eventStart).format("MMM D, YYYY")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenEvent(ev.eventId, ev.eventStart)}
                  className="text-sm text-primary hover:underline"
                >
                  Open event finances
                </button>
              </div>
              <div className="space-y-3">
                {ev.rows.map((row) => (
                  <PayableRow
                    key={row.id}
                    payeeName={row.payeeName}
                    roleLabel={row.roleLabel}
                    amount={row.amount}
                    paidAt={null}
                    onMarkPaid={() => onMarkPaid(row)}
                    saving={markingId === row.id}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
