"use client";

import { useState, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";
import {
  getEventDateStringInChicago,
  getTodayStringInChicago,
  isEventPastInChicago,
  formatEventDateInChicago,
  formatEventTimeInChicago,
  formatEventDateRangeInChicago,
} from "@/lib/utils/dateHelpers";
import QRCheckInScanner from "@/components/QRCheckInScanner";

interface Event {
  id: string; // UUID, not number
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location: string;
  type?: string;
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
  created_at: string;
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
  created_at: string;
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
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [isInstructor, setIsInstructor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [eventsView, setEventsView] = useState<"current" | "past">("current");
  const [pastEventsMonth, setPastEventsMonth] = useState(() =>
    dayjs().format("YYYY-MM")
  );
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [scanQROpen, setScanQROpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<{ signup: Signup | CompSignup; isComp: boolean } | null>(null);
  const [scannedCheckInFading, setScannedCheckInFading] = useState(false);
  const [wrongEventMessage, setWrongEventMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      setSessionToken(session?.access_token ?? null);
      const user = session?.user;
      if (user) {
        setUserEmail(user.email || "");
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile) {
          setUserRole(profile.role || "");
          const roleLower = (profile.role || "").toLowerCase();
          const isAdminRole = roleLower === "admin";
          const isInstructorRole = !isAdminRole && (roleLower === "instructor" || roleLower.includes("instructor"));
          setIsInstructor(isInstructorRole);
          setIsAdmin(isAdminRole);
        }
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [isInstructor, isAdmin, eventsView, pastEventsMonth]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowser
        .from("events")
        .select("*")
        .order("starts_at", { ascending: true });

      if (error) {
        console.error("Error loading events:", error);
        setEvents([]);
      } else {
        const allEvents = (data || []) as Event[];
        let list: Event[];

        if (isAdmin && eventsView === "past") {
          const monthStartStr = pastEventsMonth + "-01";
          const monthEndStr = dayjs(pastEventsMonth + "-01").add(1, "month").format("YYYY-MM-DD");
          list = allEvents.filter(
            (e) => {
              const eventDate = getEventDateStringInChicago(e.starts_at);
              return eventDate >= monthStartStr && eventDate < monthEndStr;
            }
          );
        } else if (isInstructor && !isAdmin) {
          const todayChicago = getTodayStringInChicago();
          list = allEvents.filter((e) => getEventDateStringInChicago(e.starts_at) === todayChicago);
        } else {
          list = allEvents.filter((e) =>
            !isEventPastInChicago(e.starts_at, e.type === "Convention" && e.ends_at ? e.ends_at : undefined)
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
  }, [selectedEvent, filter]);

  // Set up real-time subscription for signups or comp_signups changes
  useEffect(() => {
    if (!selectedEvent) return;

    const isComp = (selectedEvent.type || "").toLowerCase() === "comp";
    const table = isComp ? "comp_signups" : "signups";
    const channelName = `${table}_changes_${selectedEvent.id}`;
    const channel = supabaseBrowser.channel(channelName);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `event_id=eq.${selectedEvent.id}`,
        },
        (payload) => {
          console.log("Realtime update -", table, payload);
          loadSignups(selectedEvent.id);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Realtime subscription active for signups", channelName);
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ Realtime subscription error for signups", channelName, status);
        } else if (status === "TIMED_OUT") {
          console.warn("⏱️ Realtime subscription timed out for signups", channelName);
        } else if (status === "CLOSED") {
          console.log("🔒 Realtime subscription closed for signups", channelName);
        } else {
          console.log("Realtime subscription status:", status, channelName);
        }
      });

    // Cleanup subscription on unmount or when selectedEvent or filter changes
    return () => {
      console.log("Cleaning up realtime subscription for signups", channelName);
      supabaseBrowser.removeChannel(channel);
    };
  }, [selectedEvent, filter, sessionToken]);

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
        return;
      }

      const params = new URLSearchParams({
        event_id: eventId.toString(),
        filter: filter,
      });
      const response = await fetch(`/api/signups?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error loading signups:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          eventId,
          isInstructor,
          isAdmin,
          userRole
        });
        setSignups([]);
        setCompSignups([]);
        setIsCompEvent(false);
        setTotalCount(0);
        setCheckedInCount(0);
        return;
      }

      const data = await response.json();
      const isComp = !!data.isComp;
      setIsCompEvent(isComp);

      if (isComp) {
        const list = data.compSignups || [];
        setCompSignups(list);
        setSignups([]);
        setTotalCount(typeof data.total === "number" ? data.total : list.length);
        setCheckedInCount(typeof data.checked_in === "number" ? data.checked_in : list.filter((c: CompSignup) => c.checked_in).length);
        console.log("Comp signups loaded:", list.length, "for event", eventId);
      } else {
        const signupsList = data.signups || [];
        setCompSignups([]);
        setTotalCount(typeof data.total === "number" ? data.total : signupsList.length);
        setCheckedInCount(typeof data.checked_in === "number" ? data.checked_in : signupsList.filter((s: Signup) => s.checked_in).length);
        const sorted = signupsList.sort((a: Signup, b: Signup) =>
          a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" })
        );
        setSignups(sorted);
        console.log("Signups loaded successfully:", signupsList.length, "for event", eventId);
      }
    } catch (err) {
      console.error("Error loading signups:", err);
      setSignups([]);
      setCompSignups([]);
      setIsCompEvent(false);
      setTotalCount(0);
      setCheckedInCount(0);
    }
  };

  const updateSignupStatus = async (
    signupId: string,
    field: "paid" | "checked_in",
    value: boolean,
    isCompSignup = false
  ): Promise<boolean> => {
    setUpdating(signupId);
    try {
      if (!sessionToken) {
        alert("Not authenticated");
        setUpdating(null);
        return false;
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error updating signup:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
        });
        alert("Failed to update signup status");
        setUpdating(null);
        return false;
      } else {
        // If checking in while viewing "not_checked_in" filter, trigger fade-out
        if (field === "checked_in" && value === true && filter === "not_checked_in") {
          setFadingOut((prev) => new Set(prev).add(signupId));
          if (isCompSignup) {
            setCheckedInCount((prev) => prev + 1);
            setCompSignups((prev) =>
              prev.map((c) =>
                c.id === signupId ? { ...c, checked_in: true, paid: true } : c
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
            setSignups((prev) =>
              prev.map((s) =>
                s.id === signupId ? { ...s, checked_in: true, paid: true } : s
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
          if (selectedEvent) loadSignups(selectedEvent.id);
        }
      }
      return true;
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to update signup status");
      return false;
    } finally {
      setUpdating(null);
    }
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

  const isSignedUpOnEventDay = (createdAt: string) =>
    !!selectedEvent &&
    getEventDateStringInChicago(selectedEvent.starts_at) === getEventDateStringInChicago(createdAt);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-10 text-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const isViewingPastMonth = isAdmin && eventsView === "past";
  const pastMonthStart = dayjs(pastEventsMonth + "-01");
  const canGoForward =
    isViewingPastMonth &&
    pastMonthStart.isBefore(dayjs().startOf("month"));

  return (
    <div className="max-w-6xl mx-auto mt-4 md:mt-10 px-4 pb-6">
      <h1 className="text-2xl md:text-3xl font-bold text-primary mb-4 md:mb-6">Event Registration</h1>

      {/* Admin only: Current vs Past Events toggle and month navigation */}
      {isAdmin && (
        <div className="bg-neutral-800 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-gray-400 text-sm font-medium">View:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEventsView("current")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  eventsView === "current"
                    ? "bg-primary text-black"
                    : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                }`}
              >
                Current Events
              </button>
              <button
                type="button"
                onClick={() => setEventsView("past")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  eventsView === "past"
                    ? "bg-primary text-black"
                    : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
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
                  className="px-3 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
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
                  className="px-3 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700"
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
            ? `Past Events — ${pastMonthStart.format("MMMM YYYY")}`
            : isInstructor && !isAdmin
              ? "Today's Events"
              : "Upcoming Events"}
        </h2>
        {events.length === 0 ? (
          <p className="text-gray-400">
            {isViewingPastMonth
              ? "No events in this month"
              : isInstructor && !isAdmin
                ? "No events scheduled for today"
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
                      {event.type === "Convention" && event.ends_at
                        ? formatEventDateRangeInChicago(event.starts_at, event.ends_at)
                        : formatEventDateInChicago(event.starts_at)}
                      {event.starts_at && !(event.type === "Convention" && event.ends_at)
                        ? ` · ${formatEventTimeInChicago(event.starts_at)}`
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
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-lg md:text-xl font-semibold text-white">
              <span className="hidden sm:inline">Signups: </span>
              {selectedEvent.title}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                  filter === "all"
                    ? "bg-primary text-black"
                    : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("not_checked_in")}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                  filter === "not_checked_in"
                    ? "bg-primary text-black"
                    : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                }`}
              >
                Not Checked In
              </button>
              <button
                onClick={() => setFilter("checked_in")}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                  filter === "checked_in"
                    ? "bg-primary text-black"
                    : "bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                }`}
              >
                Checked In
              </button>
              <button
                type="button"
                onClick={() => setScanQROpen(true)}
                className="px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium bg-primary text-black hover:bg-primary/90"
              >
                Scan QR
              </button>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-1 mb-2">
            {isCompEvent ? `${totalCount} comp registration(s) · ${checkedInCount} checked in` : `${totalCount} signed up · ${checkedInCount} checked in`}
          </p>

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
                          <p className="text-white">
                            <span className="text-primary font-medium">Strictly:</span>{" "}
                            {[c.strictly_lead_first_name, c.strictly_lead_last_name].filter(Boolean).join(" ")}
                            {([c.strictly_lead_first_name, c.strictly_lead_last_name].some(Boolean) && [c.strictly_follow_first_name, c.strictly_follow_last_name].some(Boolean)) ? " / " : ""}
                            {[c.strictly_follow_first_name, c.strictly_follow_last_name].filter(Boolean).join(" ")}
                          </p>
                        )}
                        {c.jnj_selected && (
                          <p className="text-white">
                            <span className="text-primary font-medium">JnJ:</span>{" "}
                            {[c.jnj_lead_first_name, c.jnj_lead_last_name].filter(Boolean).join(" ") ||
                              [c.jnj_follow_first_name, c.jnj_follow_last_name].filter(Boolean).join(" ")}
                          </p>
                        )}
                        <p className="text-gray-400">
                          Payment: {c.payment_method} · ${Number(c.amount_owed).toFixed(2)} · {c.paid ? "Paid" : "Unpaid"}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {new Date(c.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <button
                          onClick={() => updateCompSignupPaid(c.id, !c.paid)}
                          disabled={updating === c.id || !!c.checked_in}
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
                          disabled={updating === c.id}
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
                      <h3 className="font-semibold text-white text-sm md:text-base">
                        {signup.first_name} {signup.last_name}
                      </h3>
                      <p className="text-xs md:text-sm text-gray-400 truncate">{signup.email}</p>
                      <p className="text-xs md:text-sm text-gray-400">
                        Payment: {signup.payment_method}
                      </p>
                      {selectedEvent?.type?.toLowerCase() === "workshop" &&
                        isSignedUpOnEventDay(signup.created_at) && (
                          <p className="text-red-500 font-medium text-sm">Signed Up Today</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <button
                        onClick={() =>
                          updateSignupStatus(signup.id, "paid", !signup.paid)
                        }
                        disabled={updating === signup.id || signup.checked_in}
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
                        disabled={updating === signup.id}
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
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-white">
                      {(scannedResult.signup as Signup).first_name} {(scannedResult.signup as Signup).last_name}
                    </h3>
                    <p className="text-gray-400 truncate">{(scannedResult.signup as Signup).email}</p>
                    <p className="text-gray-400">
                      {(scannedResult.signup as Signup).event_title} · {(scannedResult.signup as Signup).payment_method} · {(scannedResult.signup as Signup).paid ? "Paid" : "Unpaid"}
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
                          const ok = await updateSignupStatus(scannedResult.signup.id, "paid", !(scannedResult.signup as CompSignup).paid, true);
                          if (ok) setScannedResult((prev) => prev ? { ...prev, signup: { ...prev.signup, paid: true } } : null);
                        }}
                        disabled={updating === scannedResult.signup.id || !!(scannedResult.signup as CompSignup).checked_in}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {(scannedResult.signup as CompSignup).paid ? "✓ Paid" : "Paid"}
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await updateSignupStatus(scannedResult.signup.id, "checked_in", !(scannedResult.signup as CompSignup).checked_in, true);
                          if (ok) {
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
                          const ok = await updateSignupStatus(scannedResult.signup.id, "paid", !(scannedResult.signup as Signup).paid);
                          if (ok) setScannedResult((prev) => prev ? { ...prev, signup: { ...prev.signup, paid: true } } : null);
                        }}
                        disabled={updating === scannedResult.signup.id || (scannedResult.signup as Signup).checked_in}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {(scannedResult.signup as Signup).paid ? "✓ Paid" : "Paid"}
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await updateSignupStatus(scannedResult.signup.id, "checked_in", !(scannedResult.signup as Signup).checked_in);
                          if (ok) {
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
    </div>
  );
}
