"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";
import Link from "next/link";
import { computeNashvillePayouts } from "@/lib/utils/nashvillePayouts";

const NASHVILLE_EVENT_TITLE = "Nashville Country Swing Nights!";

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
  malissa_name: string;
  malissa_payout_override: number | null;
  malissa_paid: boolean;
  malissa_paid_at: string | null;
  updated_at: string;
}

type EventsView = "upcoming" | "past" | "overview";

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  price: number | null;
  type?: string;
}

interface Signup {
  id: string;
  event_id: string;
  payment_method: string;
  paid: boolean;
  checked_in: boolean;
  stripe_tax_amount?: number | null;
  stripe_processing_fee?: number | null;
}

interface CompSignup {
  id: string;
  event_id: string;
  payment_method: string;
  paid: boolean;
  checked_in?: boolean;
  amount_owed: number;
  stripe_tax_amount?: number | null;
  stripe_processing_fee?: number | null;
}

function computeStats(
  signups: Signup[],
  eventPrice: number | null
): {
  totalSignups: number;
  checkedIn: number;
  cashTotal: number;
  stripeTotal: number;
  stripeTaxesFees: number;
} {
  const price = eventPrice ?? 0;
  let cashTotal = 0;
  let stripeTotal = 0;
  let stripeTaxesFees = 0;

  for (const s of signups) {
    const pm = (s.payment_method || "").toLowerCase();
    if (pm === "cash" && s.checked_in) {
      cashTotal += price;
    }
    if (pm === "stripe" && s.paid) {
      stripeTotal += price;
      const tax = s.stripe_tax_amount ?? 0;
      const fee = s.stripe_processing_fee ?? 0;
      stripeTaxesFees += tax + fee;
    }
  }

  return {
    totalSignups: signups.length,
    checkedIn: signups.filter((s) => s.checked_in).length,
    cashTotal,
    stripeTotal,
    stripeTaxesFees,
  };
}

function computeStatsComp(
  compSignups: CompSignup[]
): {
  totalSignups: number;
  checkedIn: number;
  cashTotal: number;
  stripeTotal: number;
  stripeTaxesFees: number;
} {
  let cashTotal = 0;
  let stripeTotal = 0;
  let stripeTaxesFees = 0;

  for (const s of compSignups) {
    const pm = (s.payment_method || "").toLowerCase();
    const amount = Number(s.amount_owed) || 0;
    // Cash: count when checked in (same semantics as regular events: "Cash + checked in")
    if (pm === "cash" && s.checked_in) {
      cashTotal += amount;
    }
    if (pm === "stripe" && s.paid) {
      stripeTotal += amount;
      stripeTaxesFees += (s.stripe_tax_amount ?? 0) + (s.stripe_processing_fee ?? 0);
    }
  }

  return {
    totalSignups: compSignups.length,
    checkedIn: compSignups.filter((s) => s.checked_in).length,
    cashTotal,
    stripeTotal,
    stripeTaxesFees,
  };
}

function aggregateStats(
  eventStats: { totalSignups: number; checkedIn: number; cashTotal: number; stripeTotal: number; stripeTaxesFees: number }[]
): {
  totalSignups: number;
  checkedIn: number;
  cashTotal: number;
  stripeTotal: number;
  stripeTaxesFees: number;
} {
  return eventStats.reduce(
    (acc, s) => ({
      totalSignups: acc.totalSignups + s.totalSignups,
      checkedIn: acc.checkedIn + s.checkedIn,
      cashTotal: acc.cashTotal + s.cashTotal,
      stripeTotal: acc.stripeTotal + s.stripeTotal,
      stripeTaxesFees: acc.stripeTaxesFees + s.stripeTaxesFees,
    }),
    { totalSignups: 0, checkedIn: 0, cashTotal: 0, stripeTotal: 0, stripeTaxesFees: 0 }
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
  const [overviewStats, setOverviewStats] = useState<{
    totalSignups: number;
    checkedIn: number;
    cashTotal: number;
    stripeTotal: number;
    stripeTaxesFees: number;
  } | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [nashvilleFinances, setNashvilleFinances] = useState<NashvilleFinances | null>(null);
  const [loadingNashville, setLoadingNashville] = useState(false);
  const [nashvilleError, setNashvilleError] = useState<string | null>(null);
  const [nashvilleSaving, setNashvilleSaving] = useState(false);
  const [nashvilleCashInput, setNashvilleCashInput] = useState("");
  const [nashvilleStripeInput, setNashvilleStripeInput] = useState("");

  const filteredEvents = useMemo(() => {
    const t = dayjs().startOf("day");
    if (eventsView === "upcoming") {
      return events
        .filter((e) => dayjs(e.date).isSame(t, "day") || dayjs(e.date).isAfter(t, "day"))
        .sort((a, b) => {
          const da = dayjs(a.date);
          const db = dayjs(b.date);
          return da.isBefore(db) ? -1 : da.isAfter(db) ? 1 : 0;
        });
    }
    if (eventsView === "past") {
      return events
        .filter((e) => dayjs(e.date).isBefore(t, "day"))
        .sort((a, b) => {
          const da = dayjs(a.date);
          const db = dayjs(b.date);
          return da.isAfter(db) ? -1 : da.isBefore(db) ? 1 : 0;
        });
    }
    return [];
  }, [events, eventsView]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const e of events) {
      set.add(dayjs(e.date).year());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [events]);

  const eventCountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of events) {
      const y = dayjs(e.date).year();
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const eventsInSelectedYear = useMemo(() => {
    if (selectedYear == null) return [];
    return events
      .filter((e) => dayjs(e.date).year() === selectedYear)
      .sort((a, b) => {
        const da = dayjs(a.date);
        const db = dayjs(b.date);
        return da.isBefore(db) ? -1 : da.isAfter(db) ? 1 : 0;
      });
  }, [events, selectedYear]);

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabaseBrowser
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      const roleLower = (profile?.role || "").toLowerCase();
      setIsAdmin(roleLower === "admin");
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
        .select("id, title, date, location, price, type")
        .order("date", { ascending: false });

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
      return;
    }

    const loadSignups = async () => {
      setLoadingSignups(true);
      setSignupsError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session) {
          setSignups([]);
          setCompSignups([]);
          setIsCompEvent(false);
          setSignupsError("Session expired. Please sign in again.");
          setLoadingSignups(false);
          return;
        }

        const params = new URLSearchParams({
          event_id: selectedEvent.id,
          filter: "all",
        });
        const res = await fetch(`/api/signups?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            (body as { error?: string })?.error ||
            (res.status === 401
              ? "Session expired. Please sign in again."
              : res.status === 403
                ? "You don’t have permission to view signups."
                : "Failed to load signups. Check your connection and try again.");
          setSignupsError(msg);
          setSignups([]);
          setCompSignups([]);
          setIsCompEvent(false);
        } else {
          const json = await res.json();
          const isComp = !!json.isComp;
          setIsCompEvent(isComp);
          if (isComp) {
            setCompSignups(json.compSignups || []);
            setSignups([]);
          } else {
            setSignups(json.signups || []);
            setCompSignups([]);
          }
        }
      } catch (e) {
        setSignupsError(
          "Connection failed. Check your network and try again."
        );
        setSignups([]);
        setCompSignups([]);
        setIsCompEvent(false);
      } finally {
        setLoadingSignups(false);
      }
    };

    loadSignups();
  }, [isAdmin, eventsView, selectedEvent]);

  useEffect(() => {
    if (!isAdmin || eventsView !== "overview" || selectedYear == null || !eventsInSelectedYear.length) {
      setOverviewStats(null);
      setOverviewError(null);
      return;
    }

    const loadOverview = async () => {
      setLoadingOverview(true);
      setOverviewError(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session) {
          setOverviewError("Session expired. Please sign in again.");
          setOverviewStats(null);
          setLoadingOverview(false);
          return;
        }

        const results = await Promise.all(
          eventsInSelectedYear.map(async (ev) => {
            const params = new URLSearchParams({ event_id: ev.id, filter: "all" });
            const res = await fetch(`/api/signups?${params}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error((body as { error?: string })?.error || "Failed to load signups");
            }
            const json = await res.json();
            if (json.isComp) {
              return computeStatsComp(json.compSignups || []);
            }
            return computeStats(json.signups || [], ev.price);
          })
        );

        setOverviewStats(aggregateStats(results));
      } catch (e) {
        setOverviewError(
          e instanceof Error ? e.message : "Connection failed. Check your network and try again."
        );
        setOverviewStats(null);
      } finally {
        setLoadingOverview(false);
      }
    };

    loadOverview();
  }, [isAdmin, eventsView, selectedYear, eventsInSelectedYear]);

  const isNashvilleEvent = selectedEvent?.title === NASHVILLE_EVENT_TITLE;

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
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session) {
          setNashvilleError("Session expired. Please sign in again.");
          setNashvilleFinances(null);
          setLoadingNashville(false);
          return;
        }
        const params = new URLSearchParams({ event_id: selectedEvent.id });
        const res = await fetch(`/api/admin/nashville-night-finances?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
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
  }, [isAdmin, eventsView, selectedEvent?.id, isNashvilleEvent]);

  const patchNashville = useCallback(
    async (updates: {
      venue_cost?: number;
      cash_override?: number | null;
      stripe_override?: number | null;
      bt1_name?: string;
      bt2_name?: string;
      malissa_name?: string;
      bt1_payout_override?: number | null;
      bt2_payout_override?: number | null;
      malissa_payout_override?: number | null;
      mark_bt1_paid?: boolean;
      mark_bt2_paid?: boolean;
      mark_malissa_paid?: boolean;
    }) => {
      if (!selectedEvent || !isNashvilleEvent) return;
      setNashvilleSaving(true);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/admin/nashville-night-finances", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
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
    [selectedEvent?.id, isNashvilleEvent]
  );

  const stats = eventsView === "overview" && overviewStats
    ? overviewStats
    : isCompEvent
      ? computeStatsComp(compSignups)
      : computeStats(signups, selectedEvent?.price ?? null);

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
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-primary"
        >
          ← Back to site
        </Link>
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
                      {dayjs(ev.date).format("MMM D, YYYY")}
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
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                            <span className="text-sm font-medium text-neutral-300">
                              Total revenue (Cash + Stripe)
                            </span>
                            <div className="flex flex-col gap-1">
                              <span className="text-lg font-bold text-primary">
                                $
                                {(overviewStats.cashTotal + overviewStats.stripeTotal).toFixed(2)}
                              </span>
                              {overviewStats.stripeTaxesFees > 0 && (
                                <span className="text-xs text-neutral-400">
                                  Taxes/Fees collected via Stripe:{" "}
                                  <span className="font-semibold text-accent">
                                    ${overviewStats.stripeTaxesFees.toFixed(2)}{" "}
                                  </span>
                                  (to remain in bank)
                                </span>
                              )}
                            </div>
                      </div>
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
                    {dayjs(selectedEvent.date).format("dddd, MMMM D, YYYY")}
                    {selectedEvent.location
                      ? ` · ${selectedEvent.location}`
                      : ""}
                  </p>
                  {selectedEvent.price != null && (
                    <p className="mt-1 text-sm text-neutral-400">
                      Event price: ${Number(selectedEvent.price).toFixed(2)}
                    </p>
                  )}
                </div>

                {loadingSignups ? (
                  <div className="flex min-h-[180px] items-center justify-center text-neutral-400">
                    Loading signups…
                  </div>
                ) : signupsError ? (
                  <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
                    <p className="font-medium">{signupsError}</p>
                    <p className="mt-2 text-sm text-neutral-400">
                      Make sure you’re signed in as an admin and your session
                      is valid. You can{" "}
                      <Link href="/auth" className="underline hover:no-underline">
                        sign in again
                      </Link>{" "}
                      or go back to the site and retry.
                    </p>
                  </div>
                ) : (
                  <>
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
                        </>
                      )}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800/30 px-4 py-3">
                      <span className="text-sm font-medium text-neutral-300">
                        Total revenue (Cash + Stripe)
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-lg font-bold text-primary">
                          $
                          {(isNashvilleEvent ? effectiveCash + effectiveStripe : stats.cashTotal + stats.stripeTotal).toFixed(2)}
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
    malissa_name?: string;
    bt1_payout_override?: number | null;
    bt2_payout_override?: number | null;
    malissa_payout_override?: number | null;
    mark_bt1_paid?: boolean;
    mark_bt2_paid?: boolean;
    mark_malissa_paid?: boolean;
  }) => Promise<void>;
}) {
  const venueCost = nashville?.venue_cost ?? 0;
  const totalRevenue = effectiveCash + effectiveStripe;
  const autoPayouts = useMemo(
    () =>
      computeNashvillePayouts({
        cashTotal: effectiveCash,
        stripeTotal: effectiveStripe,
        venueCost,
      }),
    [effectiveCash, effectiveStripe, venueCost]
  );

  const effectivePayouts = useMemo(
    () =>
      computeNashvillePayouts({
        cashTotal: effectiveCash,
        stripeTotal: effectiveStripe,
        venueCost,
        bt1Override: nashville?.bt1_payout_override ?? null,
        bt2Override: nashville?.bt2_payout_override ?? null,
        malissaOverride: nashville?.malissa_payout_override ?? null,
      }),
    [
      effectiveCash,
      effectiveStripe,
      venueCost,
      nashville?.bt1_payout_override,
      nashville?.bt2_payout_override,
      nashville?.malissa_payout_override,
    ]
  );

  const allocations = useMemo(
    () => [
      { label: "Studio cost (venue)", value: venueCost },
      { label: "Beginner Teacher 1 payout", value: effectivePayouts.bt1Payout },
      { label: "Beginner Teacher 2 payout", value: effectivePayouts.bt2Payout },
      { label: "Malissa payout", value: effectivePayouts.malissaPayout },
      { label: "Cash → Isaiah", value: effectivePayouts.isaiahPayout },
      { label: "Electronic → CCS", value: effectivePayouts.ccsElectronic },
    ],
    [
      venueCost,
      effectivePayouts.bt1Payout,
      effectivePayouts.bt2Payout,
      effectivePayouts.malissaPayout,
      effectivePayouts.isaiahPayout,
      effectivePayouts.ccsElectronic,
    ]
  );

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
  const [malissaName, setMalissaName] = useState(nashville?.malissa_name ?? "Malissa");
  const [bt1PayoutInput, setBt1PayoutInput] = useState("");
  const [bt2PayoutInput, setBt2PayoutInput] = useState("");
  const [malissaPayoutInput, setMalissaPayoutInput] = useState("");
  const [payoutOverrideError, setPayoutOverrideError] = useState<string | null>(null);

  useEffect(() => {
    setVenueInput(String(nashville?.venue_cost ?? 0));
    setBt1Name(nashville?.bt1_name ?? "Beginner Teacher 1");
    setBt2Name(nashville?.bt2_name ?? "Beginner Teacher 2");
    setMalissaName(nashville?.malissa_name ?? "Malissa");
  }, [nashville?.venue_cost, nashville?.bt1_name, nashville?.bt2_name, nashville?.malissa_name]);

  useEffect(() => {
    setBt1PayoutInput(String(effectivePayouts.bt1Payout));
    setBt2PayoutInput(String(effectivePayouts.bt2Payout));
    setMalissaPayoutInput(String(effectivePayouts.malissaPayout));
    setPayoutOverrideError(null);
  }, [effectivePayouts.bt1Payout, effectivePayouts.bt2Payout, effectivePayouts.malissaPayout]);

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
  const saveMalissaName = () => {
    const s = malissaName.trim();
    if (s && s !== (nashville?.malissa_name ?? "Malissa")) onPatch({ malissa_name: s });
  };

  const validateTeacherOverrides = useCallback(
    (next: { bt1?: number | null; bt2?: number | null; malissa?: number | null }) => {
      const effectiveBt1 =
        next.bt1 !== undefined ? next.bt1 : (nashville?.bt1_payout_override ?? null);
      const effectiveBt2 =
        next.bt2 !== undefined ? next.bt2 : (nashville?.bt2_payout_override ?? null);
      const effectiveMalissa =
        next.malissa !== undefined ? next.malissa : (nashville?.malissa_payout_override ?? null);

      const bt1 = effectiveBt1 ?? autoPayouts.bt1Payout;
      const bt2 = effectiveBt2 ?? autoPayouts.bt2Payout;
      const malissa = effectiveMalissa ?? autoPayouts.malissaPayout;

      const total = Math.round((bt1 + bt2 + malissa) * 100) / 100;
      const cap = effectivePayouts.cashAvailableForTeachers;
      if (total > cap + 0.0001) {
        return `Teacher payouts ($${total.toFixed(2)}) exceed available cash after venue cost ($${cap.toFixed(2)}).`;
      }
      return null;
    },
    [
      nashville?.bt1_payout_override,
      nashville?.bt2_payout_override,
      nashville?.malissa_payout_override,
      autoPayouts.bt1Payout,
      autoPayouts.bt2Payout,
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
  const saveMalissaOverride = () => {
    const v = parseFloat(malissaPayoutInput);
    if (Number.isNaN(v) || v < 0) return;
    const msg = validateTeacherOverrides({ malissa: v });
    setPayoutOverrideError(msg);
    if (!msg) onPatch({ malissa_payout_override: v });
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
            Manual teacher payouts exceeded available cash after venue cost; Malissa was reduced to fit.
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
        <TeacherRow
          label="Malissa"
          name={malissaName}
          onNameChange={setMalissaName}
          onNameBlur={saveMalissaName}
          payout={effectivePayouts.malissaPayout}
          payoutInput={malissaPayoutInput}
          onPayoutChange={setMalissaPayoutInput}
          onPayoutBlur={saveMalissaOverride}
          isPayoutOverride={(nashville?.malissa_payout_override ?? null) != null}
          autoPayout={autoPayouts.malissaPayout}
          onClearOverride={() => onPatch({ malissa_payout_override: null })}
          paid={nashville?.malissa_paid ?? false}
          paidAt={nashville?.malissa_paid_at ?? null}
          onMarkPaid={() => onPatch({ mark_malissa_paid: true })}
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
