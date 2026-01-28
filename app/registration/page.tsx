"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";

interface Event {
  id: string; // UUID, not number
  title: string;
  date: string;
  location: string;
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

type FilterType = "all" | "not_checked_in" | "checked_in";

export default function RegistrationPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [isInstructor, setIsInstructor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile) {
          setUserRole(profile.role || "");
          // Use case-insensitive role check to handle variations
          const roleLower = (profile.role || "").toLowerCase();
          const isAdminRole = roleLower === "admin";
          // Only check for instructor if NOT an admin (admins get special treatment)
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
  }, [isInstructor, isAdmin]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const today = dayjs().startOf("day");
      
      let query = supabaseBrowser
        .from("events")
        .select("*")
        .order("date", { ascending: true });

      // Instructors only see events happening today
      // Admins see all upcoming events (today and future)
      if (isInstructor && !isAdmin) {
        const todayStr = today.format("YYYY-MM-DD");
        query = query.eq("date", todayStr);
      } else {
        // Admins see all upcoming events (today and future)
        query = query.gte("date", today.format("YYYY-MM-DD"));
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading events:", error);
      } else {
        setEvents(data || []);
        if (data && data.length > 0 && !selectedEvent) {
          setSelectedEvent(data[0]);
        }
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEvent) {
      loadSignups(selectedEvent.id);
    }
  }, [selectedEvent, filter]);

  // Set up real-time subscription for signups changes
  useEffect(() => {
    if (!selectedEvent) return;

    const channelName = `signups_changes_${selectedEvent.id}`;
    const channel = supabaseBrowser.channel(channelName);

    // Subscribe to signups changes for this event
    channel
      .on(
        "postgres_changes",
        {
          event: "*", // Listen for INSERT, UPDATE, DELETE
          schema: "public",
          table: "signups",
          filter: `event_id=eq.${selectedEvent.id}`, // Only listen for this event's signups
        },
        (payload) => {
          console.log("Realtime update - signups:", payload);
          // Reload signups when changes are detected
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

    // Cleanup subscription on unmount or when selectedEvent changes
    return () => {
      console.log("Cleaning up realtime subscription for signups", channelName);
      supabaseBrowser.removeChannel(channel);
    };
  }, [selectedEvent]);

  // Polling fallback: refresh signups every 10 seconds as backup
  useEffect(() => {
    if (!selectedEvent) return;

    const intervalId = setInterval(() => {
      console.log("Polling: Refreshing signups...");
      loadSignups(selectedEvent.id);
    }, 20000); // Poll every 20 seconds

    return () => clearInterval(intervalId);
  }, [selectedEvent]);

  const loadSignups = async (eventId: string) => {
    try {
      // Get the current session to send access token
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session) {
        console.error("No session found");
        setSignups([]);
        return;
      }

      // Use API route which handles authentication and RLS bypass for instructors/admins
      const params = new URLSearchParams({
        event_id: eventId.toString(),
        filter: filter,
      });
      
      const response = await fetch(`/api/signups?${params.toString()}`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
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
        return;
      }

      const { signups } = await response.json();
      console.log("Signups loaded successfully:", signups?.length || 0, "signups for event", eventId);
      
      // Sort by first name alphabetically (case-insensitive)
      const sorted = (signups || []).sort((a: Signup, b: Signup) => 
        a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' })
      );
      setSignups(sorted);
    } catch (err) {
      console.error("Error loading signups:", err);
      setSignups([]);
    }
  };

  const updateSignupStatus = async (
    signupId: string,
    field: "paid" | "checked_in",
    value: boolean
  ) => {
    setUpdating(signupId);
    try {
      // Get the current session to send access token
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session) {
        alert("Not authenticated");
        setUpdating(null);
        return;
      }

      // Use API route which handles authentication and RLS bypass for instructors/admins
      const response = await fetch("/api/signups", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          signupId,
          field,
          value,
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
      } else {
        // If checking in while viewing "not_checked_in" filter, trigger fade-out
        if (field === "checked_in" && value === true && filter === "not_checked_in") {
          // Add to fading out set
          setFadingOut((prev) => new Set(prev).add(signupId));
          
          // Update the signup locally to show green color immediately
          setSignups((prev) =>
            prev.map((s) =>
              s.id === signupId ? { ...s, checked_in: true, paid: true } : s
            )
          );
          
          // Remove from list after 2 seconds
          setTimeout(() => {
            setSignups((prev) => prev.filter((s) => s.id !== signupId));
            setFadingOut((prev) => {
              const next = new Set(prev);
              next.delete(signupId);
              return next;
            });
          }, 2000);
        } else {
          // Reload signups normally for other cases
          if (selectedEvent) {
            loadSignups(selectedEvent.id);
          }
        }
      }
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to update signup status");
    } finally {
      setUpdating(null);
    }
  };

  const getRowColor = (signup: Signup) => {
    if (signup.checked_in) {
      return "bg-green-900/30 border-green-600";
    } else if (signup.paid) {
      return "bg-yellow-900/30 border-yellow-600";
    }
    return "bg-neutral-800 border-neutral-700";
  };

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

      {/* Events List */}
      <div className="bg-neutral-800 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">
          {isInstructor && !isAdmin ? "Today's Events" : "Upcoming Events"}
        </h2>
        {events.length === 0 ? (
          <p className="text-gray-400">
            {isInstructor && !isAdmin
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
                      {dayjs(event.date).format("MMMM D, YYYY")}
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
            </div>
          </div>

          {signups.length === 0 ? (
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
    </div>
  );
}
