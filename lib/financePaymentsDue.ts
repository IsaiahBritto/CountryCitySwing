import { supabaseServer } from "@/lib/supabaseServer";
import {
  guestInstructorNameFromEventTitle,
  type PaymentDueRow,
  type PaymentsDueByEvent,
  type PaymentsDueResult,
} from "@/lib/financePaymentsDueTypes";
import {
  adjustedWorkshopGuestInstructorAmount,
  defaultCcsDiscountTotalFrom,
} from "@/lib/financeSignupBreakdown";
import {
  computeSocialDoorPayouts,
  computeSocialSplit,
  effectiveDoorAmount,
  isSocialDoorPayoutModel,
  normalizeDoorPayouts,
  totalRevenueFromMetricsRow,
  type MetricsRevenueInput,
} from "@/lib/socialFinancesConstants";
import { computeNashvillePayouts } from "@/lib/utils/nashvillePayouts";

export type {
  MarkPaidRoute,
  PaymentDueRow,
  PaymentsDueByEvent,
  PaymentsDueResult,
} from "@/lib/financePaymentsDueTypes";

const MIN_AMOUNT = 0.01;

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function isMeaningfulAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > MIN_AMOUNT;
}

function nashvilleActiveBtCount(row: {
  bt3_name?: string | null;
  bt4_name?: string | null;
}): 2 | 3 | 4 {
  if (row.bt4_name != null && String(row.bt4_name).trim() !== "") return 4;
  if (row.bt3_name != null && String(row.bt3_name).trim() !== "") return 3;
  return 2;
}

function effectiveNashvilleCashStripe(
  nf: { cash_override?: number | null; stripe_override?: number | null },
  metrics: MetricsRevenueInput | null
): { cash: number; stripe: number } {
  const cash =
    nf.cash_override != null
      ? Number(nf.cash_override)
      : Number(metrics?.cash_total ?? 0);
  const stripe =
    nf.stripe_override != null
      ? Number(nf.stripe_override)
      : Number(metrics?.stripe_total ?? 0);
  return { cash, stripe };
}

function computeWorkshopGuestAmount(
  wf: {
    studio_cost?: number | null;
    total_override?: number | null;
    guest_instructor_amount?: number | null;
  },
  metrics: MetricsRevenueInput | null,
  defaultStudioCost: number
): number {
  const computedTotal = totalRevenueFromMetricsRow(metrics);
  const effectiveTotal =
    wf.total_override != null ? Number(wf.total_override) : computedTotal;
  const studioCost =
    wf.studio_cost != null ? Number(wf.studio_cost) : defaultStudioCost;
  const remaining = Math.max(0, effectiveTotal - studioCost);
  const ccsDiscount = defaultCcsDiscountTotalFrom({
    ccsTeamTotal: metrics?.ccs_team_total ?? 0,
  });
  const rawGuest =
    wf.guest_instructor_amount != null
      ? Number(wf.guest_instructor_amount)
      : round2(Math.max(0, remaining * 0.9));
  return adjustedWorkshopGuestInstructorAmount(rawGuest, ccsDiscount);
}

type EventMeta = {
  id: string;
  title: string;
  starts_at: string | null;
  type?: string | null;
  time_zone?: string | null;
};

export function buildPaymentsDueRows(
  eventMeta: Map<string, EventMeta>,
  metricsByEvent: Map<string, MetricsRevenueInput>,
  nashvilleRows: Record<string, unknown>[],
  socialRows: Record<string, unknown>[],
  workshopRows: Record<string, unknown>[],
  judgeRows: { id: string; event_id: string; judge_name: string | null; amount_paid: number | null; paid: boolean | null }[]
): PaymentDueRow[] {
  const rows: PaymentDueRow[] = [];

  for (const nf of nashvilleRows) {
    const eventId = String(nf.event_id ?? "");
    if (!eventId) continue;
    const metrics = metricsByEvent.get(eventId) ?? null;
    const { cash, stripe } = effectiveNashvilleCashStripe(
      nf as { cash_override?: number | null; stripe_override?: number | null },
      metrics
    );
    const venueCost = Number(nf.venue_cost) || 0;
    const activeBtCount = nashvilleActiveBtCount(
      nf as { bt3_name?: string | null; bt4_name?: string | null }
    );
    const payouts = computeNashvillePayouts({
      cashTotal: cash,
      stripeTotal: stripe,
      venueCost,
      activeBtCount,
      bt1Override: (nf.bt1_payout_override as number | null) ?? null,
      bt2Override: (nf.bt2_payout_override as number | null) ?? null,
      bt3Override: (nf.bt3_payout_override as number | null) ?? null,
      bt4Override: (nf.bt4_payout_override as number | null) ?? null,
      malissaOverride: (nf.upper_level_payout_override as number | null) ?? null,
    });

    const teachers: {
      key: string;
      label: string;
      name: string;
      amount: number;
      paid: boolean;
      markKey: string;
    }[] = [
      {
        key: "bt1",
        label: "Beginner Teacher 1",
        name: String(nf.bt1_name ?? "Beginner Teacher 1"),
        amount: payouts.bt1Payout,
        paid: !!nf.bt1_paid,
        markKey: "mark_bt1_paid",
      },
      {
        key: "bt2",
        label: "Beginner Teacher 2",
        name: String(nf.bt2_name ?? "Beginner Teacher 2"),
        amount: payouts.bt2Payout,
        paid: !!nf.bt2_paid,
        markKey: "mark_bt2_paid",
      },
    ];

    if (activeBtCount >= 3) {
      teachers.push({
        key: "bt3",
        label: "Beginner Teacher 3",
        name: String(nf.bt3_name ?? "Beginner Teacher 3"),
        amount: payouts.bt3Payout,
        paid: !!nf.bt3_paid,
        markKey: "mark_bt3_paid",
      });
    }
    if (activeBtCount >= 4) {
      teachers.push({
        key: "bt4",
        label: "Beginner Teacher 4",
        name: String(nf.bt4_name ?? "Beginner Teacher 4"),
        amount: payouts.bt4Payout,
        paid: !!nf.bt4_paid,
        markKey: "mark_bt4_paid",
      });
    }
    teachers.push({
      key: "upper",
      label: "Upper Level Teacher",
      name: String(nf.upper_level_teacher_name ?? "Malissa"),
      amount: payouts.malissaPayout,
      paid: !!nf.upper_level_paid,
      markKey: "mark_upper_level_paid",
    });

    for (const t of teachers) {
      if (t.paid || !isMeaningfulAmount(t.amount)) continue;
      rows.push({
        id: `nashville:${eventId}:${t.key}`,
        eventId,
        payeeName: t.name.trim() || t.label,
        amount: round2(t.amount),
        roleLabel: t.label,
        markPaid: {
          route: "nashville-night-finances",
          body: { event_id: eventId, [t.markKey]: true },
        },
      });
    }
  }

  for (const sf of socialRows) {
    const eventId = String(sf.event_id ?? "");
    if (!eventId) continue;
    const meta = eventMeta.get(eventId);
    const metrics = metricsByEvent.get(eventId) ?? null;
    const useDoorModel = isSocialDoorPayoutModel(meta?.starts_at, meta?.time_zone);

    if (useDoorModel) {
      const doorRows = normalizeDoorPayouts(sf.door_payouts);
      const payouts = computeSocialDoorPayouts({
        cashTotal: Number(metrics?.cash_total ?? 0),
        stripeTotal: Number(metrics?.stripe_total ?? 0),
        venueCost: Number(sf.venue_cost) || 0,
        otherExpense: Number(sf.other_expense) || 0,
        doorRows,
      });
      doorRows.forEach((door, index) => {
        if (door.paid_at != null) return;
        const amount = payouts.doorAmounts[index] ?? effectiveDoorAmount(door);
        if (!isMeaningfulAmount(amount)) return;
        rows.push({
          id: `social:${eventId}:door:${door.slot_id ?? index}`,
          eventId,
          payeeName: door.name || `Doorman ${index + 1}`,
          amount: round2(amount),
          roleLabel: "Doorman",
          markPaid: {
            route: "the-social-finances",
            body: {
              event_id: eventId,
              mark_door_paid_index: index,
            },
          },
        });
      });
      continue;
    }

    const totalRevenue = totalRevenueFromMetricsRow(metrics);
    const cashTotal = Number(metrics?.cash_total ?? 0);
    const split = computeSocialSplit({
      totalRevenue,
      cashTotal,
      venueCost: Number(sf.venue_cost) || 0,
      otherExpense: Number(sf.other_expense) || 0,
      brandonRatio: Number(sf.brandon_split_ratio) || 0.2,
      kylerRatio: Number(sf.kyler_split_ratio) || 0.3,
      isaiahRatio: Number(sf.isaiah_split_ratio) || 0.5,
      brandonProfitOverride:
        sf.brandon_profit != null ? Number(sf.brandon_profit) : undefined,
      kylerProfitOverride:
        sf.kyler_profit != null ? Number(sf.kyler_profit) : undefined,
    });

    const people: {
      key: string;
      name: string;
      amount: number;
      paidAt: string | null;
      markKey: string;
    }[] = [
      {
        key: "brandon",
        name: "Brandon",
        amount: split.brandon_profit,
        paidAt: (sf.brandon_paid_at as string | null) ?? null,
        markKey: "mark_brandon_paid",
      },
      {
        key: "kyler",
        name: "Kyler",
        amount: split.kyler_profit,
        paidAt: (sf.kyler_paid_at as string | null) ?? null,
        markKey: "mark_kyler_paid",
      },
      {
        key: "isaiah",
        name: "Isaiah",
        amount: split.isaiah_profit,
        paidAt: (sf.isaiah_paid_at as string | null) ?? null,
        markKey: "mark_isaiah_paid",
      },
    ];

    for (const p of people) {
      if (p.paidAt != null || !isMeaningfulAmount(p.amount)) continue;
      rows.push({
        id: `social:${eventId}:${p.key}`,
        eventId,
        payeeName: p.name,
        amount: round2(p.amount),
        roleLabel: "Social",
        markPaid: {
          route: "the-social-finances",
          body: { event_id: eventId, [p.markKey]: true },
        },
      });
    }
  }

  for (const wf of workshopRows) {
    const eventId = String(wf.event_id ?? "");
    if (!eventId) continue;
    if (wf.guest_instructor_paid_at != null) continue;

    const meta = eventMeta.get(eventId);
    const isClassEvent =
      (meta?.type ?? "").toString().trim().toLowerCase() === "class";
    const defaultStudioCost = isClassEvent ? 400 : 0;
    const metrics = metricsByEvent.get(eventId) ?? null;
    const amount = computeWorkshopGuestAmount(
      wf as {
        studio_cost?: number | null;
        total_override?: number | null;
        guest_instructor_amount?: number | null;
      },
      metrics,
      defaultStudioCost
    );
    if (!isMeaningfulAmount(amount)) continue;

    rows.push({
      id: `workshop:${eventId}:guest`,
      eventId,
      payeeName: guestInstructorNameFromEventTitle(meta?.title),
      amount,
      roleLabel: "Guest instructor",
      markPaid: {
        route: "workshop-finances",
        body: { event_id: eventId, mark_guest_instructor_paid: true },
      },
    });
  }

  for (const j of judgeRows) {
    if (j.paid) continue;
    const amount = round2(Number(j.amount_paid) || 0);
    if (!isMeaningfulAmount(amount)) continue;
    const eventId = j.event_id;
    rows.push({
      id: `judge:${j.id}`,
      eventId,
      payeeName: (j.judge_name ?? "").trim() || "Judge",
      amount,
      roleLabel: "Judge",
      markPaid: {
        route: "comp-finances",
        body: { event_id: eventId, mark_judge_paid: j.id },
      },
    });
  }

  return rows;
}

export function groupPaymentsDueByEvent(
  rows: PaymentDueRow[],
  eventMeta: Map<string, EventMeta>
): PaymentsDueByEvent[] {
  const byEvent = new Map<string, PaymentDueRow[]>();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push(row);
    byEvent.set(row.eventId, list);
  }

  const events: PaymentsDueByEvent[] = [];
  for (const [eventId, eventRows] of byEvent) {
    const meta = eventMeta.get(eventId);
    events.push({
      eventId,
      eventTitle: meta?.title ?? "Event",
      eventStart: meta?.starts_at ?? null,
      rows: eventRows,
    });
  }

  events.sort((a, b) => {
    const ta = a.eventStart ? new Date(a.eventStart).getTime() : 0;
    const tb = b.eventStart ? new Date(b.eventStart).getTime() : 0;
    return tb - ta;
  });

  return events;
}

export async function fetchPaymentsDue(): Promise<PaymentsDueResult> {
  const [
    nashvilleRes,
    socialRes,
    workshopRes,
    judgesRes,
    metricsRes,
    eventsRes,
  ] = await Promise.all([
    supabaseServer
      .from("nashville_night_finances")
      .select(
        "event_id,venue_cost,cash_override,stripe_override,bt1_name,bt2_name,bt3_name,bt4_name,upper_level_teacher_name,bt1_payout_override,bt2_payout_override,bt3_payout_override,bt4_payout_override,upper_level_payout_override,bt1_paid,bt2_paid,bt3_paid,bt4_paid,upper_level_paid"
      ),
    supabaseServer
      .from("the_social_finances")
      .select(
        "event_id,venue_cost,other_expense,door_payouts,brandon_split_ratio,kyler_split_ratio,isaiah_split_ratio,brandon_profit,kyler_profit,brandon_paid_at,kyler_paid_at,isaiah_paid_at"
      ),
    supabaseServer
      .from("workshop_finances")
      .select(
        "event_id,studio_cost,total_override,guest_instructor_amount,guest_instructor_paid_at"
      ),
    supabaseServer
      .from("comp_judge_payouts")
      .select("id,event_id,judge_name,amount_paid,paid")
      .eq("paid", false),
    supabaseServer
      .from("event_finance_metrics")
      .select("event_id,cash_total,stripe_total,other_total,ccs_team_total"),
    supabaseServer.from("events").select("id,title,starts_at,type,time_zone"),
  ]);

  if (nashvilleRes.error) throw nashvilleRes.error;
  if (socialRes.error) throw socialRes.error;
  if (workshopRes.error) throw workshopRes.error;
  if (judgesRes.error) throw judgesRes.error;
  if (metricsRes.error) throw metricsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const eventMeta = new Map<string, EventMeta>();
  for (const e of eventsRes.data ?? []) {
    eventMeta.set(e.id, {
      id: e.id,
      title: e.title ?? "Event",
      starts_at: e.starts_at ?? null,
      type: e.type ?? null,
      time_zone: e.time_zone ?? null,
    });
  }

  const metricsByEvent = new Map<string, MetricsRevenueInput>();
  for (const m of metricsRes.data ?? []) {
    metricsByEvent.set(m.event_id, m);
  }

  const flatRows = buildPaymentsDueRows(
    eventMeta,
    metricsByEvent,
    (nashvilleRes.data ?? []) as Record<string, unknown>[],
    (socialRes.data ?? []) as Record<string, unknown>[],
    (workshopRes.data ?? []) as Record<string, unknown>[],
    (judgesRes.data ?? []) as {
      id: string;
      event_id: string;
      judge_name: string | null;
      amount_paid: number | null;
      paid: boolean | null;
    }[]
  );

  const events = groupPaymentsDueByEvent(flatRows, eventMeta);
  const totalOutstanding = round2(
    flatRows.reduce((sum, r) => sum + r.amount, 0)
  );

  return { events, totalOutstanding };
}
