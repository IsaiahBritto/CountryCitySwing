"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";
import {
  DEFAULT_TIME_ZONE,
  isEventPast,
  isRegistrationWindowOpen,
  formatEventScheduleSubtitle,
  formatDateInTimeZone,
  formatTimeInTimeZone,
  getEventDateString,
} from "@/lib/utils/dateHelpers";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import { canMutateRegistrationEvent } from "@/lib/registrationAuthPolicy";
import {
  type CheckInArrivalBuckets,
  EMPTY_CHECK_IN_ARRIVAL_BUCKETS,
} from "@/lib/utils/checkInArrivalBuckets";
import QRCheckInScanner from "@/components/QRCheckInScanner";
import RegistrationRefundModal from "@/components/RegistrationRefundModal";
import {
  resolveDueNowForSignup,
  resolvePaidAmountOptions,
  resolveSignupListPrice,
  type PriceChange,
} from "@/lib/utils/workshopPricing";
import CompLevelBadge from "@/components/CompLevelBadge";
import PlannedClassLevelBadge from "@/components/PlannedClassLevelBadge";
import { hasCompDivisionPrice } from "@/lib/compLevels";
import {
  type ClassLevelSummary,
  type PlannedClassLevel,
  PLANNED_CLASS_LEVELS,
  PLANNED_CLASS_LEVEL_LABELS,
  plannedClassLevelBadgeClass,
  plannedClassLevelModalClass,
} from "@/lib/classLevels";

type RegistrationAccessLevel = "admin" | "instructor" | "social_viewer";

interface Event {
  id: string; // UUID, not number
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location: string;
  type?: string;
  time_zone?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  all_three_classes?: boolean;
}

interface EventPricing {
  id: string;
  type?: string | null;
  starts_at?: string | null;
  time_zone?: string | null;
  price: number;
  price_changes: PriceChange[];
  ccs_team_price: number | null;
  ccs_team_price_changes: PriceChange[];
}

interface Signup {
  id: string;
  event_id: string; // UUID, not number
  event_title: string;
  first_name: string;
  last_name: string;
  email: string;
  payment_method: string;
  paid: boolean;
  checked_in: boolean;
  checked_in_at?: string | null;
  created_at: string;
  amount_owed?: number | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  /** Sum of principal from partial signup_refunds rows (API-enriched). */
  principal_refunded_total?: number | null;
  /** Collected ticket amount minus principal refunds (API-enriched). */
  net_amount_paid?: number | null;
  is_ccs_team?: boolean | null;
  refunded_or_cancelled?: string | null;
  stripe_payment_intent_id?: string | null;
  free_via_promotion_code?: boolean | null;
  used_promotion_code?: boolean | null;
  planned_class_level?: string | null;
}

interface CompSignup {
  id: string;
  event_id: string;
  event_title: string;
  strictly_selected: boolean;
  strictly_lead_first_name?: string | null;
  strictly_lead_last_name?: string | null;
  strictly_lead_email?: string | null;
  strictly_follow_first_name?: string | null;
  strictly_follow_last_name?: string | null;
  strictly_follow_email?: string | null;
  jnj_selected: boolean;
  jnj_lead_first_name?: string | null;
  jnj_lead_last_name?: string | null;
  jnj_lead_email?: string | null;
  jnj_follow_first_name?: string | null;
  jnj_follow_last_name?: string | null;
  jnj_follow_email?: string | null;
  payment_method: string;
  amount_owed: number;
  paid: boolean;
  checked_in?: boolean;
  checked_in_at?: string | null;
  created_at: string;
  refunded_or_cancelled?: string | null;
  stripe_payment_intent_id?: string | null;
}

type FilterType = "all" | "not_checked_in" | "checked_in";

export default function RegistrationPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [compSignups, setCompSignups] = useState<CompSignup[]>([]);
  const [isCompEvent, setIsCompEvent] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [filter, setFilter] = useState<FilterType>("all");
  /** Keep realtime/poll reloads on the active filter (channel effect omits filter deps). */
  const filterRef = useRef<FilterType>(filter);
  filterRef.current = filter;
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());
  const fadingOutRef = useRef<Set<string>>(fadingOut);
  fadingOutRef.current = fadingOut;
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [registrationAccess, setRegistrationAccess] =
    useState<RegistrationAccessLevel | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isInstructor, setIsInstructor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isSocialViewer = registrationAccess === "social_viewer";
  const canAccessRegistration =
    registrationAccess === "admin" ||
    registrationAccess === "instructor" ||
    registrationAccess === "social_viewer";
  const [eventsView, setEventsView] = useState<"current" | "past">("current");
  const [pastEventsMonth, setPastEventsMonth] = useState(() =>
    dayjs().format("YYYY-MM")
  );
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [scanQROpen, setScanQROpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<{ signup: Signup | CompSignup; isComp: boolean } | null>(null);
  const [scannedCheckInFading, setScannedCheckInFading] = useState(false);
  const [wrongEventMessage, setWrongEventMessage] = useState<string | null>(null);
  const [arrivalBuckets, setArrivalBuckets] = useState<CheckInArrivalBuckets>(
    EMPTY_CHECK_IN_ARRIVAL_BUCKETS
  );
  const [eventPricing, setEventPricing] = useState<EventPricing | null>(null);
  const [paidModalSignup, setPaidModalSignup] = useState<Signup | null>(null);
  const [paidModalAmount, setPaidModalAmount] = useState<number | null>(null);
  const [paidModalOther, setPaidModalOther] = useState(false);
  const [paidModalOtherValue, setPaidModalOtherValue] = useState("");
  const [dueEditSignup, setDueEditSignup] = useState<Signup | null>(null);
  const [dueEditValue, setDueEditValue] = useState("");
  const [dueEditSaving, setDueEditSaving] = useState(false);
  const [refundModal, setRefundModal] = useState<{
    signupId: string;
    isComp: boolean;
    displayName: string;
  } | null>(null);
  const [classLevelSummary, setClassLevelSummary] = useState<ClassLevelSummary | null>(
    null
  );
  const [classLevelModal, setClassLevelModal] = useState<PlannedClassLevel | null>(
    null
  );

  useEffect(() => {
    const loadUser = async () => {
      setCheckingAccess(true);
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      setSessionToken(session?.access_token ?? null);
      if (!session?.access_token) {
        setUserEmail("");
        setUserRole("");
        setRegistrationAccess(null);
        setIsInstructor(false);
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }
      setUserEmail(session.user?.email || "");
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        });
        if (!res.ok) {
          setRegistrationAccess(null);
          setIsInstructor(false);
          setIsAdmin(false);
          setCheckingAccess(false);
          return;
        }
        const data = await res.json();
        const access = data.registration_access as RegistrationAccessLevel | null | undefined;
        const allowed =
          access === "admin" || access === "instructor" || access === "social_viewer";
        setRegistrationAccess(allowed ? access! : null);
        setIsAdmin(access === "admin");
        setIsInstructor(access === "instructor");
        setUserRole(data.profile?.role || "");
      } catch {
        setRegistrationAccess(null);
        setIsInstructor(false);
        setIsAdmin(false);
      } finally {
        setCheckingAccess(false);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (!canAccessRegistration) return;
    loadEvents();
  }, [canAccessRegistration, isInstructor, isAdmin, isSocialViewer, eventsView, pastEventsMonth]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowser
        .from("events")
        .select("id,title,starts_at,ends_at,location,type,time_zone,strictly_price,jnj_price,strictly_level,jnj_level,all_three_classes")
        .order("starts_at", { ascending: true });

      if (error) {
        console.error("Error loading events:", error);
        setEvents([]);
      } else {
        const allEvents = (data || []) as Event[];
        let list: Event[];

        if ((isAdmin || isSocialViewer) && eventsView === "past") {
          const monthStartStr = pastEventsMonth + "-01";
          const monthEndStr = dayjs(pastEventsMonth + "-01").add(1, "month").format("YYYY-MM-DD");
          list = allEvents.filter((e) => {
            const tz = e.time_zone || DEFAULT_TIME_ZONE;
            const eventDate = getEventDateString(e.starts_at, tz);
            if (eventDate < monthStartStr || eventDate >= monthEndStr) return false;
            if (isSocialViewer && !isAdmin) return isSocialEventType(e.type);
            return true;
          });
        } else if (isInstructor && !isAdmin && !isSocialViewer) {
          list = allEvents.filter((e) => {
            const tz = e.time_zone || DEFAULT_TIME_ZONE;
            return isRegistrationWindowOpen(e.starts_at, e.ends_at ?? undefined, tz);
          });
        } else if (isSocialViewer && !isAdmin) {
          list = allEvents.filter(
            (e) =>
              isSocialEventType(e.type) &&
              !isEventPast(e.starts_at, e.ends_at ?? undefined, e.time_zone || DEFAULT_TIME_ZONE)
          );
        } else {
          list = allEvents.filter((e) =>
            !isEventPast(e.starts_at, e.ends_at ?? undefined, e.time_zone || DEFAULT_TIME_ZONE)
          );
        }

        setEvents(list);
        const ids = new Set(list.map((e) => e.id));
        if (!selectedEvent || !ids.has(selectedEvent.id)) {
          setSelectedEvent(list.length > 0 ? list[0] : null);
        }
      }
    } catch (err) {
      console.error("Error:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEvent) {
      loadSignups(selectedEvent.id);
    }
    setClassLevelModal(null);
  }, [selectedEvent, filter]);

  // Set up real-time subscription for signups or comp_signups changes
  useEffect(() => {
    if (!selectedEvent || !sessionToken) return;

    const isComp = (selectedEvent.type || "").toLowerCase() === "comp";
    const table = isComp ? "comp_signups" : "signups";
    const channelName = `${table}_changes_${selectedEvent.id}`;
    const eventId = selectedEvent.id;
    let cancelled = false;

    const channel = supabaseBrowser
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          if (!cancelled) loadSignups(eventId);
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          console.log("Realtime subscription active for signups", channelName);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Non-fatal: 60s poll + local actions still keep the list current.
          console.warn(
            "Realtime unavailable for signups; using poll fallback",
            channelName,
            status
          );
        }
      });

    return () => {
      cancelled = true;
      supabaseBrowser.removeChannel(channel);
    };
    // Intentionally omit `filter` — filter only affects fetch, not the channel.
    // Resubscribing on filter toggles often triggers CHANNEL_ERROR.
  }, [selectedEvent?.id, selectedEvent?.type, sessionToken]);

  // Polling fallback: refresh signups every 60 seconds as backup
  useEffect(() => {
    if (!selectedEvent) return;

    const intervalId = setInterval(() => {
      loadSignups(selectedEvent.id);
    }, 60000);

    return () => clearInterval(intervalId);
  }, [selectedEvent, filter, sessionToken]);

  const loadSignups = async (eventId: string) => {
    try {
      if (!sessionToken) {
        console.error("No session found");
        setSignups([]);
        setCompSignups([]);
        setTotalCount(0);
        setCheckedInCount(0);
        setArrivalBuckets({ ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS });
        return;
      }

      const activeFilter = filterRef.current;
      const params = new URLSearchParams({
        event_id: eventId.toString(),
        filter: activeFilter,
      });
      const response = await fetch(`/api/signups?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      
      if (!response.ok) {
        const text = await response.text();
        let errorData: { error?: string; details?: string; message?: string } = {};
        try {
          errorData = text ? JSON.parse(text) : {};
        } catch {
          errorData = { message: text?.slice(0, 500) || "Non-JSON error body" };
        }
        console.error("Error loading signups:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error ?? errorData.message,
          details: errorData.details,
          eventId,
          isInstructor,
          isAdmin,
          userRole,
        });
        setSignups([]);
        setCompSignups([]);
        setIsCompEvent(false);
        setTotalCount(0);
        setCheckedInCount(0);
        setArrivalBuckets({ ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS });
        setClassLevelSummary(null);
        return;
      }

      const data = await response.json();
      const isComp = !!data.isComp;
      setIsCompEvent(isComp);
      if (isComp) {
        setClassLevelSummary(null);
      } else if (data.all_three_classes && data.class_level_summary) {
        setClassLevelSummary(data.class_level_summary as ClassLevelSummary);
      } else {
        setClassLevelSummary(null);
      }
      if (data.eventPricing) {
        setEventPricing(data.eventPricing as EventPricing);
      } else if (!isComp) {
        setEventPricing(null);
      }

      if (isComp) {
        const list = data.compSignups || [];
        setTotalCount(typeof data.total === "number" ? data.total : list.length);
        setCheckedInCount(typeof data.checked_in === "number" ? data.checked_in : list.filter((c: CompSignup) => c.checked_in).length);
        setArrivalBuckets(
          data.check_in_arrival_buckets ?? { ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS }
        );
        setSignups([]);
        // Keep rows mid fade-out so realtime reload doesn't yank them mid-animation
        setCompSignups((prev) => {
          const fading = fadingOutRef.current;
          if (activeFilter !== "not_checked_in" || fading.size === 0) return list;
          const ids = new Set(list.map((c: CompSignup) => c.id));
          const keep = prev.filter((c) => fading.has(c.id) && !ids.has(c.id));
          return keep.length ? [...list, ...keep] : list;
        });
        console.log("Comp signups loaded:", list.length, "for event", eventId);
      } else {
        const signupsList = data.signups || [];
        setCompSignups([]);
        setTotalCount(typeof data.total === "number" ? data.total : signupsList.length);
        setCheckedInCount(typeof data.checked_in === "number" ? data.checked_in : signupsList.filter((s: Signup) => s.checked_in).length);
        setArrivalBuckets(
          data.check_in_arrival_buckets ?? { ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS }
        );
        const sorted = signupsList.sort((a: Signup, b: Signup) =>
          a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" })
        );
        // Keep rows mid fade-out so realtime reload doesn't yank them mid-animation
        setSignups((prev) => {
          const fading = fadingOutRef.current;
          if (activeFilter !== "not_checked_in" || fading.size === 0) return sorted;
          const ids = new Set(sorted.map((s: Signup) => s.id));
          const keep = prev.filter((s) => fading.has(s.id) && !ids.has(s.id));
          return keep.length ? [...sorted, ...keep] : sorted;
        });
        console.log("Signups loaded successfully:", signupsList.length, "for event", eventId);
      }
    } catch (err) {
      console.error("Error loading signups:", err);
      setSignups([]);
      setCompSignups([]);
      setIsCompEvent(false);
      setTotalCount(0);
      setCheckedInCount(0);
      setArrivalBuckets({ ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS });
      setClassLevelSummary(null);
    }
  };

  const updateSignupStatus = async (
    signupId: string,
    field: "paid" | "checked_in",
    value: boolean,
    isCompSignup = false,
    amountPaid?: number | null
  ): Promise<{ success: boolean; signup?: Signup | CompSignup }> => {
    setUpdating(signupId);
    try {
      if (!sessionToken) {
        alert("Not authenticated");
        return { success: false };
      }

      const response = await fetch("/api/signups", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          signupId,
          field,
          value,
          ...(isCompSignup ? { isComp: true } : {}),
          ...(amountPaid != null ? { amount_paid: amountPaid } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error updating signup:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
        });
        alert(errorData.error || "Failed to update signup status");
        return { success: false };
      }

      const result = await response.json();
      const updatedSignup = result.signup as Signup | CompSignup | undefined;
      const checkedInAtFromServer =
        updatedSignup != null ? (updatedSignup as Signup | CompSignup).checked_in_at : undefined;

      // If checking in while viewing "not_checked_in" filter, trigger fade-out
      if (field === "checked_in" && value === true && filter === "not_checked_in") {
        setFadingOut((prev) => new Set(prev).add(signupId));
        const at =
          typeof checkedInAtFromServer === "string"
            ? checkedInAtFromServer
            : new Date().toISOString();
        if (isCompSignup) {
          setCheckedInCount((prev) => prev + 1);
          setCompSignups((prev) =>
            prev.map((c) =>
              c.id === signupId ? { ...c, checked_in: true, paid: true, checked_in_at: at } : c
            )
          );
          setTimeout(() => {
            setCompSignups((prev) => prev.filter((c) => c.id !== signupId));
            setFadingOut((prev) => {
              const next = new Set(prev);
              next.delete(signupId);
              return next;
            });
          }, 2000);
        } else {
          setCheckedInCount((prev) => prev + 1);
          setSignups((prev) =>
            prev.map((s) =>
              s.id === signupId
                ? {
                    ...s,
                    ...(updatedSignup as Signup),
                    checked_in: true,
                    paid: true,
                    checked_in_at: at,
                  }
                : s
            )
          );
          setTimeout(() => {
            setSignups((prev) => prev.filter((s) => s.id !== signupId));
            setFadingOut((prev) => {
              const next = new Set(prev);
              next.delete(signupId);
              return next;
            });
          }, 2000);
        }
      } else {
        // Immediately merge server signup so Cash Paid shows Paid/$ amount without waiting on reload
        if (!isCompSignup && updatedSignup) {
          setSignups((prev) =>
            prev.map((s) =>
              s.id === signupId ? { ...s, ...(updatedSignup as Signup) } : s
            )
          );
        } else if (isCompSignup && updatedSignup) {
          setCompSignups((prev) =>
            prev.map((c) =>
              c.id === signupId ? { ...c, ...(updatedSignup as CompSignup) } : c
            )
          );
        }
        if (selectedEvent) loadSignups(selectedEvent.id);
      }

      return { success: true, signup: updatedSignup };
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to update signup status");
      return { success: false };
    } finally {
      setUpdating(null);
    }
  };

  const isViewingPastMonth = (isAdmin || isSocialViewer) && eventsView === "past";
  const pastMonthStart = dayjs(pastEventsMonth + "-01");
  const canGoForward =
    isViewingPastMonth &&
    pastMonthStart.isBefore(dayjs().startOf("month"));
  const readOnlyRegistration =
    isSocialViewer &&
    (eventsView === "past" ||
      (selectedEvent != null &&
        registrationAccess != null &&
        !canMutateRegistrationEvent(registrationAccess, {
          type: selectedEvent.type,
          starts_at: selectedEvent.starts_at,
          ends_at: selectedEvent.ends_at ?? null,
          time_zone: selectedEvent.time_zone,
        })));
  const showAllThreeClasses =
    !isCompEvent &&
    (selectedEvent?.all_three_classes === true || classLevelSummary != null);

  const scheduleDueForSignup = (signup: Signup): number => {
    if (!eventPricing) return Number(signup.amount_owed) || 0;
    return resolveSignupListPrice(eventPricing, {
      isCcsTeam: signup.is_ccs_team === true || signup.payment_method?.toLowerCase() === "ccs team",
    });
  };

  const dueNowForSignup = (signup: Signup): number => {
    return resolveDueNowForSignup(eventPricing, signup);
  };

  const paidOptionsForSignup = (signup: Signup): number[] => {
    if (!eventPricing) {
      const owed = Number(signup.amount_owed);
      return Number.isFinite(owed) ? [owed] : [];
    }
    return resolvePaidAmountOptions(eventPricing, {
      isCcsTeam: signup.is_ccs_team === true || signup.payment_method?.toLowerCase() === "ccs team",
    });
  };

  const paidDisplayAmount = (signup: Signup): number => {
    if (signup.net_amount_paid != null && Number.isFinite(Number(signup.net_amount_paid))) {
      return Number(signup.net_amount_paid);
    }
    const collected =
      signup.amount_paid != null && Number.isFinite(Number(signup.amount_paid))
        ? Number(signup.amount_paid)
        : Number(signup.amount_owed ?? 0);
    const refunded = Number(signup.principal_refunded_total ?? 0);
    return Math.max(0, collected - (Number.isFinite(refunded) ? refunded : 0));
  };

  const openDueEditModal = (signup: Signup) => {
    if (signup.paid || readOnlyRegistration) return;
    setDueEditSignup(signup);
    setDueEditValue(dueNowForSignup(signup).toFixed(2));
  };

  const saveDueEdit = async (amountDue: number | null) => {
    if (!dueEditSignup || !sessionToken) return;
    setDueEditSaving(true);
    try {
      const response = await fetch("/api/signups", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          signupId: dueEditSignup.id,
          field: "amount_due",
          value: amountDue,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Failed to update Due now");
        return;
      }
      const result = await response.json();
      const updated = result.signup as Signup | undefined;
      if (updated) {
        setSignups((prev) =>
          prev.map((s) => (s.id === dueEditSignup.id ? { ...s, ...updated } : s))
        );
        if (scannedResult?.signup?.id === dueEditSignup.id) {
          setScannedResult((prev) => (prev ? { ...prev, signup: updated } : null));
        }
      }
      setDueEditSignup(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update Due now");
    } finally {
      setDueEditSaving(false);
    }
  };

  const confirmDueEdit = async () => {
    const parsed = parseFloat(dueEditValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("Enter a valid amount");
      return;
    }
    await saveDueEdit(parsed);
  };

  const renderSignupAmountLine = (signup: Signup, className = "text-xs md:text-sm") => (
    <p className={`${className} text-gray-400`}>
      Registered at: ${Number(signup.amount_owed ?? 0).toFixed(2)}
      {signup.paid ? (
        <>
          {" · "}
          <span className="text-green-400 font-medium">
            Paid: ${paidDisplayAmount(signup).toFixed(2)}
          </span>
        </>
      ) : (
        <>
          {" · "}
          {readOnlyRegistration ? (
            <span className="text-red-400 font-medium">
              Due now: ${dueNowForSignup(signup).toFixed(2)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => openDueEditModal(signup)}
              title="Edit Due now"
              className="text-red-400 font-medium underline decoration-red-400/50 underline-offset-2 hover:text-red-300 hover:decoration-red-300"
            >
              Due now: ${dueNowForSignup(signup).toFixed(2)}
            </button>
          )}
        </>
      )}
    </p>
  );

  const needsCashPaidModal = (signup: Signup) => {
    const pm = (signup.payment_method || "").toLowerCase().trim();
    if (pm === "stripe") return false;
    if (pm === "ccs team") return false;
    return true;
  };

  const openPaidModal = (signup: Signup) => {
    const due = dueNowForSignup(signup);
    const options = paidOptionsForSignup(signup);
    setPaidModalSignup(signup);
    setPaidModalOther(false);
    setPaidModalOtherValue("");
    setPaidModalAmount(options.includes(due) ? due : options[options.length - 1] ?? due);
  };

  const confirmPaidModal = async () => {
    if (!paidModalSignup) return;
    let amount = paidModalAmount;
    if (paidModalOther) {
      const parsed = parseFloat(paidModalOtherValue);
      if (!Number.isFinite(parsed) || parsed < 0) {
        alert("Enter a valid amount");
        return;
      }
      amount = parsed;
    }
    if (amount == null || !Number.isFinite(amount)) {
      alert("Select an amount");
      return;
    }
    const signupId = paidModalSignup.id;
    setPaidModalSignup(null);
    const res = await updateSignupStatus(signupId, "paid", true, false, amount);
    if (res.success && res.signup && scannedResult?.signup?.id === signupId) {
      setScannedResult((prev) => (prev ? { ...prev, signup: res.signup! } : null));
    }
  };

  const handlePaidClick = (signup: Signup) => {
    if (signup.paid) {
      const pm = (signup.payment_method || "").toLowerCase().trim();
      if (pm === "stripe") return;
      updateSignupStatus(signup.id, "paid", false);
      return;
    }
    if (needsCashPaidModal(signup)) {
      openPaidModal(signup);
      return;
    }
    updateSignupStatus(signup.id, "paid", true, false, 0);
  };

  const updateCompSignupPaid = async (compSignupId: string, paid: boolean) => {
    await updateSignupStatus(compSignupId, "paid", paid, true);
  };

  const getRowColor = (signup: Signup) => {
    if (signup.checked_in) {
      return "bg-green-900/30 border-green-600";
    } else if (signup.paid) {
      return "bg-yellow-900/30 border-yellow-600";
    }
    return "bg-neutral-800 border-neutral-700";
  };

  const getRowColorComp = (c: CompSignup) => {
    if (c.checked_in) return "bg-green-900/30 border-green-600";
    if (c.paid) return "bg-yellow-900/30 border-yellow-600";
    return "bg-neutral-800 border-neutral-700";
  };

  const formatSignupCreatedAt = (createdAt: string) => {
    const tz = selectedEvent?.time_zone || DEFAULT_TIME_ZONE;
    const datePart = formatDateInTimeZone(createdAt, tz, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = formatTimeInTimeZone(createdAt, tz);
    if (!datePart || !timePart) return "";
    return `${datePart}, ${timePart}`;
  };

  const isSignedUpOnEventDay = (createdAt: string) => {
    if (!selectedEvent) return false;
    const tz = selectedEvent.time_zone || DEFAULT_TIME_ZONE;
    return getEventDateString(selectedEvent.starts_at, tz) === getEventDateString(createdAt, tz);
  };

  if (checkingAccess) {
    return (
      <div className="max-w-6xl mx-auto mt-10 text-center">
        <p className="text-gray-400">Checking access…</p>
      </div>
    );
  }

  if (!canAccessRegistration) {
    return (
      <div className="mx-auto max-w-2xl mt-10 rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">Access denied</h1>
        <p className="mb-6 text-neutral-400">
          You don&apos;t have permission to view event registration.
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-10 text-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-4 md:mt-10 px-4 pb-6">
      <h1 className="text-2xl md:text-3xl font-bold text-primary mb-4 md:mb-6">Event Registration</h1>

      {/* Current vs Past Events toggle and month navigation */}
      {(isAdmin || isSocialViewer) && (
        <div className="bg-neutral-800 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-gray-400 text-sm font-medium">View:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEventsView("current")}
                className={`p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium ${
                  eventsView === "current"
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                }`}
              >
                Current Events
              </button>
              <button
                type="button"
                onClick={() => setEventsView("past")}
                className={`p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium ${
                  eventsView === "past"
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                }`}
              >
                Past Events
              </button>
            </div>
            {isViewingPastMonth && (
              <div className="flex items-center gap-2 sm:ml-4">
                <button
                  type="button"
                  onClick={() =>
                    setPastEventsMonth(
                      pastMonthStart.subtract(1, "month").format("YYYY-MM")
                    )
                  }
                  className="p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                >
                  ← Previous month
                </button>
                <span className="text-white font-semibold min-w-[140px] text-center">
                  {pastMonthStart.format("MMMM YYYY")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPastEventsMonth(
                      pastMonthStart.add(1, "month").format("YYYY-MM")
                    )
                  }
                  disabled={!canGoForward}
                  className="p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700 disabled:hover:border-neutral-600"
                >
                  Next month →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="bg-neutral-800 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">
          {isViewingPastMonth
            ? `Past Events — ${pastMonthStart.format("MMMM YYYY")}${isSocialViewer && !isAdmin ? " (Social)" : ""}`
            : isSocialViewer && !isAdmin
              ? "Upcoming Social Events"
              : isInstructor && !isAdmin
                ? "Today's Events"
                : "Upcoming Events"}
        </h2>
        {events.length === 0 ? (
          <p className="text-gray-400">
            {isViewingPastMonth
              ? isSocialViewer && !isAdmin
                ? "No Social events in this month"
                : "No events in this month"
              : isSocialViewer && !isAdmin
                ? "No upcoming Social events"
                : isInstructor && !isAdmin
                  ? "No events in the registration window"
                  : "No upcoming events"}
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`w-full text-left p-3 md:p-4 rounded-lg border-2 transition-colors ${
                  selectedEvent?.id === event.id
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm md:text-base">{event.title}</h3>
                    <p className="text-xs md:text-sm text-gray-400 mt-1">
                      {event.starts_at
                        ? formatEventScheduleSubtitle(
                            event.starts_at,
                            event.ends_at,
                            event.time_zone || DEFAULT_TIME_ZONE,
                            event.type
                          )
                        : ""}
                    </p>
                    <p className="text-xs md:text-sm text-gray-400">
                      {event.location}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Signups List */}
      {selectedEvent && (
        <div className="bg-neutral-800 rounded-lg p-4 md:p-6">
          {readOnlyRegistration && (
            <p className="mb-4 rounded-lg border border-neutral-600 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-300">
              View only — check-in opens on event day.
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-white">
                <span className="hidden sm:inline">Signups: </span>
                {selectedEvent.title}
              </h2>
              {isCompEvent &&
                (hasCompDivisionPrice(selectedEvent.strictly_price) ||
                  hasCompDivisionPrice(selectedEvent.jnj_price)) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {hasCompDivisionPrice(selectedEvent.strictly_price) && (
                    <span className="inline-flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-primary font-medium">Strictly</span>
                      <CompLevelBadge level={selectedEvent.strictly_level} />
                    </span>
                  )}
                  {hasCompDivisionPrice(selectedEvent.jnj_price) && (
                    <span className="inline-flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-primary font-medium">JnJ</span>
                      <CompLevelBadge level={selectedEvent.jnj_level} />
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium ${
                  filter === "all"
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("not_checked_in")}
                className={`p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium ${
                  filter === "not_checked_in"
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                }`}
              >
                Not Checked In
              </button>
              <button
                onClick={() => setFilter("checked_in")}
                className={`p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium ${
                  filter === "checked_in"
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50"
                }`}
              >
                Checked In
              </button>
              <button
                type="button"
                onClick={() => setScanQROpen(true)}
                disabled={readOnlyRegistration}
                className="p-3 md:p-4 rounded-lg border-2 transition-colors text-sm md:text-base font-medium bg-neutral-700 border-neutral-600 text-gray-300 hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-600"
              >
                Scan QR
              </button>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-1 mb-2">
            {isCompEvent ? `${totalCount} comp registration(s) · ${checkedInCount} checked in` : `${totalCount} signed up · ${checkedInCount} checked in`}
          </p>

          {showAllThreeClasses && classLevelSummary && (
            <div className="mb-4 flex flex-wrap gap-2">
              {PLANNED_CLASS_LEVELS.map((level) => {
                const { total, checked_in } = classLevelSummary.counts[level];
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => total > 0 && setClassLevelModal(level)}
                    disabled={total === 0}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${plannedClassLevelBadgeClass(level)} ${
                      total > 0
                        ? "hover:brightness-110 cursor-pointer"
                        : "opacity-50 cursor-default"
                    }`}
                  >
                    <div className="text-xs font-medium opacity-90">
                      {PLANNED_CLASS_LEVEL_LABELS[level]}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {total} signed up
                      <span className="font-normal opacity-80"> · {checked_in} checked in</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {checkedInCount > 0 && (
            <div className="mb-4 rounded-lg border border-neutral-600 bg-neutral-900/50 p-4">
              <h3 className="text-sm font-semibold text-white mb-1">Check-in timing vs. start</h3>
              <p className="text-xs text-gray-500 mb-3">
                Each count is registrations checked in during that window after scheduled start (
                {selectedEvent.time_zone || DEFAULT_TIME_ZONE}). “Before start” is before that time; “Unknown
                time” is checked in with no timestamp (e.g. before this feature).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-sm">
                <div className="rounded-md bg-neutral-800/80 px-3 py-2 border border-neutral-700">
                  <div className="text-gray-400 text-xs">0–30 min</div>
                  <div className="text-white font-semibold text-lg tabular-nums">{arrivalBuckets.m0_30}</div>
                </div>
                <div className="rounded-md bg-neutral-800/80 px-3 py-2 border border-neutral-700">
                  <div className="text-gray-400 text-xs">30–35 min</div>
                  <div className="text-white font-semibold text-lg tabular-nums">{arrivalBuckets.m30_35}</div>
                </div>
                <div className="rounded-md bg-neutral-800/80 px-3 py-2 border border-neutral-700">
                  <div className="text-gray-400 text-xs">35–40 min</div>
                  <div className="text-white font-semibold text-lg tabular-nums">{arrivalBuckets.m35_40}</div>
                </div>
                <div className="rounded-md bg-neutral-800/80 px-3 py-2 border border-neutral-700">
                  <div className="text-gray-400 text-xs">40–45 min</div>
                  <div className="text-white font-semibold text-lg tabular-nums">{arrivalBuckets.m40_45}</div>
                </div>
                <div className="rounded-md bg-neutral-800/80 px-3 py-2 border border-neutral-700 sm:col-span-2 md:col-span-1">
                  <div className="text-gray-400 text-xs">45+ min</div>
                  <div className="text-white font-semibold text-lg tabular-nums">{arrivalBuckets.m45plus}</div>
                </div>
              </div>
              {(arrivalBuckets.beforeStart > 0 || arrivalBuckets.unknownTime > 0) && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
                  {arrivalBuckets.beforeStart > 0 && (
                    <span>
                      Before start: <span className="text-gray-200 font-medium tabular-nums">{arrivalBuckets.beforeStart}</span>
                    </span>
                  )}
                  {arrivalBuckets.unknownTime > 0 && (
                    <span>
                      Unknown time:{" "}
                      <span className="text-gray-200 font-medium tabular-nums">{arrivalBuckets.unknownTime}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {isCompEvent ? (
            compSignups.length === 0 ? (
              <p className="text-gray-400">No comp signups found for this event.</p>
            ) : (
              <div className="space-y-3">
                {compSignups.map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 md:p-4 rounded-lg border-2 transition-opacity duration-2000 ease-out ${
                      fadingOut.has(c.id) ? "opacity-0" : "opacity-100"
                    } ${getRowColorComp(c)}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        {c.strictly_selected && (
                          <p className="text-white flex flex-wrap items-center gap-2">
                            <span className="text-primary font-medium">Strictly:</span>
                            <CompLevelBadge level={selectedEvent.strictly_level} />
                            <span>
                            {isAdmin ? (
                              <button
                                type="button"
                                className="underline decoration-primary/60 underline-offset-2 hover:text-primary text-left"
                                onClick={() =>
                                  setRefundModal({
                                    signupId: c.id,
                                    isComp: true,
                                    displayName:
                                      [
                                        [c.strictly_lead_first_name, c.strictly_lead_last_name]
                                          .filter(Boolean)
                                          .join(" "),
                                        [c.strictly_follow_first_name, c.strictly_follow_last_name]
                                          .filter(Boolean)
                                          .join(" "),
                                      ]
                                        .filter(Boolean)
                                        .join(" / ") || "Comp registration",
                                  })
                                }
                              >
                                {[c.strictly_lead_first_name, c.strictly_lead_last_name]
                                  .filter(Boolean)
                                  .join(" ")}
                                {([c.strictly_lead_first_name, c.strictly_lead_last_name].some(
                                  Boolean
                                ) &&
                                [c.strictly_follow_first_name, c.strictly_follow_last_name].some(
                                  Boolean
                                )
                                  ? " / "
                                  : "") +
                                  [c.strictly_follow_first_name, c.strictly_follow_last_name]
                                    .filter(Boolean)
                                    .join(" ")}
                              </button>
                            ) : (
                              <>
                                {[c.strictly_lead_first_name, c.strictly_lead_last_name]
                                  .filter(Boolean)
                                  .join(" ")}
                                {([c.strictly_lead_first_name, c.strictly_lead_last_name].some(
                                  Boolean
                                ) &&
                                [c.strictly_follow_first_name, c.strictly_follow_last_name].some(
                                  Boolean
                                )
                                  ? " / "
                                  : "")}
                                {[c.strictly_follow_first_name, c.strictly_follow_last_name]
                                  .filter(Boolean)
                                  .join(" ")}
                              </>
                            )}
                            </span>
                          </p>
                        )}
                        {c.jnj_selected && (
                          <p className="text-white flex flex-wrap items-center gap-2">
                            <span className="text-primary font-medium">JnJ:</span>
                            <CompLevelBadge level={selectedEvent.jnj_level} />
                            <span>
                            {isAdmin ? (
                              <button
                                type="button"
                                className="underline decoration-primary/60 underline-offset-2 hover:text-primary text-left"
                                onClick={() =>
                                  setRefundModal({
                                    signupId: c.id,
                                    isComp: true,
                                    displayName:
                                      [
                                        c.jnj_lead_first_name,
                                        c.jnj_lead_last_name,
                                      ]
                                        .filter(Boolean)
                                        .join(" ") ||
                                      [
                                        c.jnj_follow_first_name,
                                        c.jnj_follow_last_name,
                                      ]
                                        .filter(Boolean)
                                        .join(" ") ||
                                      "Comp registration",
                                  })
                                }
                              >
                                {[c.jnj_lead_first_name, c.jnj_lead_last_name]
                                  .filter(Boolean)
                                  .join(" ") ||
                                  [c.jnj_follow_first_name, c.jnj_follow_last_name]
                                    .filter(Boolean)
                                    .join(" ")}
                              </button>
                            ) : (
                              <>
                                {[c.jnj_lead_first_name, c.jnj_lead_last_name]
                                  .filter(Boolean)
                                  .join(" ") ||
                                  [c.jnj_follow_first_name, c.jnj_follow_last_name]
                                    .filter(Boolean)
                                    .join(" ")}
                              </>
                            )}
                            </span>
                          </p>
                        )}
                        {isAdmin && c.refunded_or_cancelled === "partial" && (
                          <p className="text-amber-300 text-xs font-medium mt-1">Partial refund</p>
                        )}
                        <p className="text-gray-400">
                          Payment: {c.payment_method} · ${Number(c.amount_owed).toFixed(2)} · {c.paid ? "Paid" : "Unpaid"}
                        </p>
                        <p className="text-gray-500 text-xs">
                          Date: {formatSignupCreatedAt(c.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <button
                          onClick={() => updateCompSignupPaid(c.id, !c.paid)}
                          disabled={readOnlyRegistration || updating === c.id || !!c.checked_in}
                          className={`px-4 py-2 md:px-5 md:py-2.5 rounded-md text-sm md:text-base font-medium transition-all duration-200 whitespace-nowrap ${
                            c.paid
                              ? "bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                              : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                          } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700`}
                        >
                          {c.paid ? "✓ Paid" : "Paid"}
                        </button>
                        <button
                          onClick={() =>
                            updateSignupStatus(c.id, "checked_in", !c.checked_in, true)
                          }
                          disabled={readOnlyRegistration || updating === c.id}
                          className={`px-4 py-2 md:px-5 md:py-2.5 rounded-md text-sm md:text-base font-medium transition-all duration-200 whitespace-nowrap ${
                            c.checked_in
                              ? "bg-green-600 text-white hover:bg-green-500 shadow-[0_0_10px_rgba(22,163,74,0.5)]"
                              : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                          } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700`}
                        >
                          {c.checked_in ? "✓ Checked In" : "Check In"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : signups.length === 0 ? (
            <p className="text-gray-400">No signups found for this event.</p>
          ) : (
            <div className="space-y-3">
              {signups.map((signup) => (
                <div
                  key={signup.id}
                  className={`p-3 md:p-4 rounded-lg border-2 transition-opacity duration-[2000ms] ease-out ${
                    fadingOut.has(signup.id) ? "opacity-0" : "opacity-100"
                  } ${getRowColor(signup)}`}
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm md:text-base flex flex-wrap items-center gap-2">
                        {isAdmin ? (
                          <button
                            type="button"
                            className="underline decoration-primary/60 underline-offset-2 hover:text-primary text-left"
                            onClick={() =>
                              setRefundModal({
                                signupId: signup.id,
                                isComp: false,
                                displayName: `${signup.first_name} ${signup.last_name}`.trim(),
                              })
                            }
                          >
                            {signup.first_name} {signup.last_name}
                          </button>
                        ) : (
                          <>
                            {signup.first_name} {signup.last_name}
                          </>
                        )}
                        {isAdmin && showAllThreeClasses && (
                          <PlannedClassLevelBadge level={signup.planned_class_level} />
                        )}
                      </h3>
                      {isAdmin && signup.refunded_or_cancelled === "partial" && (
                        <p className="text-amber-300 text-xs font-medium">Partial refund</p>
                      )}
                      <p className="text-xs md:text-sm text-gray-400 truncate">{signup.email}</p>
                      <p className="text-xs md:text-sm text-gray-400">
                        Payment: {signup.payment_method}
                      </p>
                      {renderSignupAmountLine(signup)}
                      <p className="text-gray-500 text-xs md:text-sm">
                        Date: {formatSignupCreatedAt(signup.created_at)}
                      </p>
                      {selectedEvent?.type?.toLowerCase() === "workshop" &&
                        isSignedUpOnEventDay(signup.created_at) && (
                          <p className="text-red-500 font-medium text-sm">Signed Up Today</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <button
                        onClick={() => handlePaidClick(signup)}
                        disabled={
                          readOnlyRegistration ||
                          updating === signup.id ||
                          signup.checked_in ||
                          (signup.paid &&
                            (signup.payment_method || "").toLowerCase().trim() === "stripe")
                        }
                        className={`px-4 py-2 md:px-5 md:py-2.5 rounded-md text-sm md:text-base font-medium transition-all duration-200 whitespace-nowrap ${
                          signup.paid
                            ? "bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                            : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                        } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700`}
                      >
                        {signup.paid ? "✓ Paid" : "Paid"}
                      </button>
                      <button
                        onClick={() =>
                          updateSignupStatus(
                            signup.id,
                            "checked_in",
                            !signup.checked_in
                          )
                        }
                        disabled={readOnlyRegistration || updating === signup.id}
                        className={`px-4 py-2 md:px-5 md:py-2.5 rounded-md text-sm md:text-base font-medium transition-all duration-200 whitespace-nowrap ${
                          signup.checked_in
                            ? "bg-green-600 text-white hover:bg-green-500 shadow-[0_0_10px_rgba(22,163,74,0.5)]"
                            : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                        } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700`}
                      >
                        {signup.checked_in ? "✓ Checked In" : "Check In"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Scanned registration popup */}
      {scannedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div
            className={`w-full max-w-md rounded-xl border-2 p-4 transition-all duration-1000 ease-out ${
              scannedCheckInFading
                ? "bg-green-900/50 border-green-500"
                : "bg-neutral-800 border-red-500"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-sm font-medium text-primary">Scanned registration</span>
              {!scannedCheckInFading && (
                <button
                  type="button"
                  onClick={() => {
                    setScannedResult(null);
                    setScanQROpen(true);
                  }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Close
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                {scannedResult.isComp ? (
                  <>
                    {(scannedResult.signup as CompSignup).strictly_selected && (
                      <p className="text-white">
                        <span className="text-primary font-medium">Strictly:</span>{" "}
                        {[
                          (scannedResult.signup as CompSignup).strictly_lead_first_name,
                          (scannedResult.signup as CompSignup).strictly_lead_last_name,
                        ].filter(Boolean).join(" ")}
                        {[(scannedResult.signup as CompSignup).strictly_follow_first_name, (scannedResult.signup as CompSignup).strictly_follow_last_name].some(Boolean) ? " / " : ""}
                        {[
                          (scannedResult.signup as CompSignup).strictly_follow_first_name,
                          (scannedResult.signup as CompSignup).strictly_follow_last_name,
                        ].filter(Boolean).join(" ")}
                      </p>
                    )}
                    {(scannedResult.signup as CompSignup).jnj_selected && (
                      <p className="text-white">
                        <span className="text-primary font-medium">JnJ:</span>{" "}
                        {[(scannedResult.signup as CompSignup).jnj_lead_first_name, (scannedResult.signup as CompSignup).jnj_lead_last_name].filter(Boolean).join(" ")}
                      </p>
                    )}
                    <p className="text-gray-400">
                      {(scannedResult.signup as CompSignup).event_title} · Payment: {(scannedResult.signup as CompSignup).payment_method} · ${Number((scannedResult.signup as CompSignup).amount_owed ?? 0).toFixed(2)} · {(scannedResult.signup as CompSignup).paid ? "Paid" : "Unpaid"}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Date: {formatSignupCreatedAt((scannedResult.signup as CompSignup).created_at)}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-white flex flex-wrap items-center gap-2">
                      {(scannedResult.signup as Signup).first_name}{" "}
                      {(scannedResult.signup as Signup).last_name}
                      {isAdmin && showAllThreeClasses && (
                        <PlannedClassLevelBadge
                          level={(scannedResult.signup as Signup).planned_class_level}
                        />
                      )}
                    </h3>
                    <p className="text-gray-400 truncate">{(scannedResult.signup as Signup).email}</p>
                    <p className="text-gray-400">
                      {(scannedResult.signup as Signup).event_title} · {(scannedResult.signup as Signup).payment_method}
                      {" · "}
                      {(scannedResult.signup as Signup).paid ? "Paid" : "Unpaid"}
                    </p>
                    {renderSignupAmountLine(scannedResult.signup as Signup, "text-sm")}
                    <p className="text-gray-500 text-xs">
                      Date: {formatSignupCreatedAt((scannedResult.signup as Signup).created_at)}
                    </p>
                  </>
                )}
              </div>
              {!scannedCheckInFading && (
                <div className="flex items-center gap-2 shrink-0">
                  {scannedResult.isComp ? (
                    <>
                      <button
                        onClick={async () => {
                          const res = await updateSignupStatus(scannedResult.signup.id, "paid", !(scannedResult.signup as CompSignup).paid, true);
                          if (res.success && res.signup) {
                            setScannedResult((prev) => (prev ? { ...prev, signup: res.signup! } : null));
                          }
                        }}
                        disabled={updating === scannedResult.signup.id || !!(scannedResult.signup as CompSignup).checked_in}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {(scannedResult.signup as CompSignup).paid ? "✓ Paid" : "Paid"}
                      </button>
                      <button
                        onClick={async () => {
                          const res = await updateSignupStatus(
                            scannedResult.signup.id,
                            "checked_in",
                            !(scannedResult.signup as CompSignup).checked_in,
                            true
                          );
                          if (res.success) {
                            if (res.signup) {
                              setScannedResult((prev) => (prev ? { ...prev, signup: res.signup! } : null));
                            }
                            setScannedCheckInFading(true);
                            if (selectedEvent) loadSignups(selectedEvent.id);
                            setTimeout(() => {
                              setScannedResult(null);
                              setScannedCheckInFading(false);
                              setScanQROpen(true);
                            }, 1000);
                          }
                        }}
                        disabled={updating === scannedResult.signup.id}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-500"
                      >
                        {(scannedResult.signup as CompSignup).checked_in ? "✓ Checked In" : "Check In"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          const s = scannedResult.signup as Signup;
                          if (s.paid) {
                            if ((s.payment_method || "").toLowerCase().trim() === "stripe") return;
                            const res = await updateSignupStatus(s.id, "paid", false);
                            if (res.success && res.signup) {
                              setScannedResult((prev) => (prev ? { ...prev, signup: res.signup! } : null));
                            }
                            return;
                          }
                          if (needsCashPaidModal(s)) {
                            openPaidModal(s);
                            return;
                          }
                          const res = await updateSignupStatus(s.id, "paid", true, false, 0);
                          if (res.success && res.signup) {
                            setScannedResult((prev) => (prev ? { ...prev, signup: res.signup! } : null));
                          }
                        }}
                        disabled={
                          updating === scannedResult.signup.id ||
                          (scannedResult.signup as Signup).checked_in ||
                          ((scannedResult.signup as Signup).paid &&
                            ((scannedResult.signup as Signup).payment_method || "")
                              .toLowerCase()
                              .trim() === "stripe")
                        }
                        className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {(scannedResult.signup as Signup).paid ? "✓ Paid" : "Paid"}
                      </button>
                      <button
                        onClick={async () => {
                          const res = await updateSignupStatus(
                            scannedResult.signup.id,
                            "checked_in",
                            !(scannedResult.signup as Signup).checked_in
                          );
                          if (res.success) {
                            if (res.signup) {
                              setScannedResult((prev) => (prev ? { ...prev, signup: res.signup! } : null));
                            }
                            setScannedCheckInFading(true);
                            if (selectedEvent) loadSignups(selectedEvent.id);
                            setTimeout(() => {
                              setScannedResult(null);
                              setScannedCheckInFading(false);
                              setScanQROpen(true);
                            }, 1000);
                          }
                        }}
                        disabled={updating === scannedResult.signup.id}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-500"
                      >
                        {(scannedResult.signup as Signup).checked_in ? "✓ Checked In" : "Check In"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Cash Paid amount modal */}
      {paidModalSignup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-600 bg-neutral-800 p-5">
            <h3 className="text-lg font-semibold text-white mb-1">Confirm cash amount</h3>
            <p className="text-sm text-gray-400 mb-4">
              {paidModalSignup.first_name} {paidModalSignup.last_name} · Due now $
              {dueNowForSignup(paidModalSignup).toFixed(2)}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {paidOptionsForSignup(paidModalSignup).map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setPaidModalOther(false);
                    setPaidModalAmount(amt);
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    !paidModalOther && paidModalAmount === amt
                      ? "bg-yellow-500 text-black"
                      : "bg-neutral-700 text-gray-200 hover:bg-neutral-600"
                  }`}
                >
                  ${amt.toFixed(2)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPaidModalOther(true);
                  setPaidModalAmount(null);
                }}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  paidModalOther
                    ? "bg-yellow-500 text-black"
                    : "bg-neutral-700 text-gray-200 hover:bg-neutral-600"
                }`}
              >
                Other
              </button>
            </div>
            {paidModalOther && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={paidModalOtherValue}
                onChange={(e) => setPaidModalOtherValue(e.target.value)}
                placeholder="Enter amount"
                className="w-full mb-4 px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPaidModalSignup(null)}
                className="px-4 py-2 rounded-md text-sm bg-neutral-700 text-gray-200 hover:bg-neutral-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPaidModal}
                className="px-4 py-2 rounded-md text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400"
              >
                Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Due now modal */}
      {dueEditSignup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-600 bg-neutral-800 p-5">
            <h3 className="text-lg font-semibold text-white mb-1">Edit Due now</h3>
            <p className="text-sm text-gray-400 mb-4">
              {dueEditSignup.first_name} {dueEditSignup.last_name} · Registered at $
              {Number(dueEditSignup.amount_owed ?? 0).toFixed(2)} · Schedule $
              {scheduleDueForSignup(dueEditSignup).toFixed(2)}
            </p>
            <label className="block text-sm text-gray-300 mb-1" htmlFor="due-edit-amount">
              Due now ($)
            </label>
            <input
              id="due-edit-amount"
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={dueEditValue}
              onChange={(e) => setDueEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmDueEdit();
                }
              }}
              className="w-full mb-4 px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white"
            />
            <div className="flex flex-wrap gap-2 justify-between">
              <button
                type="button"
                disabled={dueEditSaving}
                onClick={() => void saveDueEdit(null)}
                className="px-4 py-2 rounded-md text-sm bg-neutral-700 text-gray-200 hover:bg-neutral-600 disabled:opacity-50"
              >
                Reset to schedule
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={dueEditSaving}
                  onClick={() => setDueEditSignup(null)}
                  className="px-4 py-2 rounded-md text-sm bg-neutral-700 text-gray-200 hover:bg-neutral-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={dueEditSaving}
                  onClick={() => void confirmDueEdit()}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-black hover:bg-primary/90 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Wrong event message (scanned registration not for current event) */}
      {wrongEventMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-600 bg-neutral-800 p-5 text-center">
            <p className="text-white mb-4">{wrongEventMessage}</p>
            <button
              type="button"
              onClick={() => {
                setWrongEventMessage(null);
                setScanQROpen(true);
              }}
              className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-black hover:bg-primary/90"
            >
              Back to scanning
            </button>
          </div>
        </div>
      )}
      <QRCheckInScanner
        open={scanQROpen}
        onClose={() => setScanQROpen(false)}
        sessionToken={sessionToken}
        onLookup={(result) => {
          if (!selectedEvent) {
            setWrongEventMessage("Please select an event to check in for.");
            return;
          }
          const signup = result.signup as unknown as Signup | CompSignup;
          if (signup.event_id !== selectedEvent.id) {
            setWrongEventMessage("Registration found but does not belong to the current event.");
            return;
          }
          setScannedResult({ signup, isComp: result.isComp });
        }}
      />
      {classLevelModal && classLevelSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div
            className={`w-full max-w-md rounded-xl border-2 p-5 shadow-xl ${plannedClassLevelModalClass(classLevelModal)}`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {PLANNED_CLASS_LEVEL_LABELS[classLevelModal]}
                </h3>
                <p className="text-sm text-gray-400 tabular-nums">
                  {classLevelSummary.counts[classLevelModal].total} signed up ·{" "}
                  {classLevelSummary.counts[classLevelModal].checked_in} checked in
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClassLevelModal(null)}
                className="text-sm text-gray-400 hover:text-white shrink-0"
              >
                Close
              </button>
            </div>
            {classLevelSummary.roster[classLevelModal].length === 0 ? (
              <p className="text-sm text-gray-400">No signups for this level.</p>
            ) : (
              <ul className="space-y-2 max-h-[min(60vh,24rem)] overflow-y-auto pr-1">
                {classLevelSummary.roster[classLevelModal].map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-white block">
                        {entry.first_name} {entry.last_name}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {(entry.class_signup_count ?? 0) === 1
                          ? "1 class signup"
                          : `${entry.class_signup_count ?? 0} class signups`}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        entry.checked_in ? "text-green-400" : "text-gray-500"
                      }`}
                    >
                      {entry.checked_in ? "Checked in" : "Not checked in"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {refundModal && sessionToken && (
        <RegistrationRefundModal
          open={!!refundModal}
          onClose={() => setRefundModal(null)}
          sessionToken={sessionToken}
          signupId={refundModal.signupId}
          isComp={refundModal.isComp}
          displayName={refundModal.displayName}
          onDone={() => {
            if (selectedEvent) {
              // Refresh current event list
              void (async () => {
                try {
                  const params = new URLSearchParams({
                    event_id: selectedEvent.id,
                    filter: filterRef.current,
                  });
                  const res = await fetch(`/api/signups?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${sessionToken}` },
                  });
                  if (!res.ok) return;
                  const data = await res.json();
                  if (data.isComp) {
                    setCompSignups(data.compSignups || []);
                    setIsCompEvent(true);
                    setTotalCount(data.total ?? 0);
                    setCheckedInCount(data.checked_in ?? 0);
                  } else {
                    setSignups(data.signups || []);
                    setIsCompEvent(false);
                    setTotalCount(data.total ?? 0);
                    setCheckedInCount(data.checked_in ?? 0);
                  }
                } catch {
                  /* ignore */
                }
              })();
            }
          }}
        />
      )}
    </div>
  );
}
