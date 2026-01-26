"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import dayjs from "dayjs";

interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
}

interface Signup {
  id: string;
  event_id: number;
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
          setIsInstructor(profile.role === "instructor");
          setIsAdmin(profile.role === "admin");
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

  const loadSignups = async (eventId: number) => {
    try {
      let query = supabaseBrowser
        .from("signups")
        .select("*")
        .eq("event_id", eventId)
        .order("first_name", { ascending: true });

      // Apply filter
      if (filter === "not_checked_in") {
        query = query.eq("checked_in", false);
      } else if (filter === "checked_in") {
        query = query.eq("checked_in", true);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading signups:", error);
      } else {
        // Sort by first name alphabetically (case-insensitive)
        const sorted = (data || []).sort((a, b) => 
          a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' })
        );
        setSignups(sorted);
      }
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const updateSignupStatus = async (
    signupId: string,
    field: "paid" | "checked_in",
    value: boolean
  ) => {
    setUpdating(signupId);
    try {
      const updateData: any = { [field]: value };
      
      // If checking in, also mark as paid
      if (field === "checked_in" && value === true) {
        updateData.paid = true;
      }

      const { error } = await supabaseBrowser
        .from("signups")
        .update(updateData)
        .eq("id", signupId);

      if (error) {
        console.error("Error updating signup:", error);
        alert("Failed to update signup status");
      } else {
        // Reload signups
        if (selectedEvent) {
          loadSignups(selectedEvent.id);
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
                  className={`p-3 md:p-4 rounded-lg border-2 ${getRowColor(signup)}`}
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
                    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={signup.paid}
                          onChange={(e) =>
                            updateSignupStatus(signup.id, "paid", e.target.checked)
                          }
                          disabled={updating === signup.id || signup.checked_in}
                          className="w-4 h-4 md:w-5 md:h-5 text-primary focus:ring-primary border-neutral-600 bg-neutral-700 rounded shrink-0"
                        />
                        <span className="text-xs md:text-sm text-gray-300 whitespace-nowrap">Paid</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={signup.checked_in}
                          onChange={(e) =>
                            updateSignupStatus(
                              signup.id,
                              "checked_in",
                              e.target.checked
                            )
                          }
                          disabled={updating === signup.id}
                          className="w-4 h-4 md:w-5 md:h-5 text-primary focus:ring-primary border-neutral-600 bg-neutral-700 rounded shrink-0"
                        />
                        <span className="text-xs md:text-sm text-gray-300 whitespace-nowrap">Check In</span>
                      </label>
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
