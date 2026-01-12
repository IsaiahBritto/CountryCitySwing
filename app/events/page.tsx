"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import Calendar from "@/components/Calendar";
import WorkshopSpotlight from "@/components/WorkshopSpotlight";
import EventCarousel from "@/components/EventCarousel";
import EventSignupModal from "@/components/EventSignupModal";
import { parseLocalDate } from "@/lib/utils/dateHelpers";

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState<"dynamic" | "list">("dynamic");
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: true });

      if (error) console.error("Supabase error:", error);
      else setEvents(data || []);
      setLoading(false);
    }
    loadEvents();
  }, []);

  // Filter upcoming events only (today and future)
  const today = dayjs().startOf("day");
  const upcomingEvents = events.filter((e) =>
    dayjs(e.date).isSame(today, "day") || dayjs(e.date).isAfter(today, "day")
  );

  return (
    <section className="max-w-5xl mx-auto text-center px-4">
      <h2 className="text-3xl font-semibold text-primary mb-4">
        Upcoming Events
      </h2>

      {/* --- View Switcher --- */}
      <div className="flex justify-center mb-8 space-x-3">
        <button
          onClick={() => setView("dynamic")}
          className={`px-4 py-2 rounded-md font-semibold transition-all duration-200 ${
            view === "dynamic"
              ? "bg-primary text-white shadow-[0_0_10px_rgba(242,201,76,0.6)]"
              : "bg-neutral-800 text-gray-300 hover:bg-neutral-700"
          }`}
        >
          Dynamic View
        </button>

        <button
          onClick={() => setView("list")}
          className={`px-4 py-2 rounded-md font-semibold transition-all duration-200 ${
            view === "list"
              ? "bg-accent text-white shadow-[0_0_10px_rgba(187,134,252,0.6)]"
              : "bg-neutral-800 text-gray-300 hover:bg-neutral-700"
          }`}
        >
          List View
        </button>
      </div>

      {/* --- Loading or Empty --- */}
      {loading && (
        <p className="text-gray-400 mb-8">Loading upcoming events...</p>
      )}
      {!loading && upcomingEvents.length === 0 && (
        <p className="text-gray-400 mb-8">No upcoming events yet.</p>
      )}

      {/* --- Dynamic View --- */}
      {!loading && view === "dynamic" && upcomingEvents.length > 0 && (
        <div className="space-y-10">
          <section className="max-w-5xl mx-auto text-center px-4">
            <h2 className="text-3xl font-semibold text-primary mb-6">
              Upcoming Events
            </h2>

            <WorkshopSpotlight events={upcomingEvents} />
            <Calendar events={events} /> {/* calendar shows all events */}
            <EventCarousel events={upcomingEvents} />
          </section>
        </div>
      )}

      {/* --- List View (upcoming only, with modal trigger) --- */}
      {!loading && view === "list" && upcomingEvents.length > 0 && (
        <div className="max-w-3xl mx-auto text-left bg-neutral-800 rounded-lg shadow-[0_0_20px_rgba(187,134,252,0.4)] divide-y divide-neutral-700">
          {upcomingEvents.map((event) => (
            <div key={event.id} className="p-5 hover:bg-neutral-700/40">
              <h3 className="text-xl font-bold text-primary mb-1">
                {event.title}
              </h3>
              <p className="text-gray-400 mb-1">
                {parseLocalDate(event.date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                {event.time && ` • ${event.time}`}
              </p>
              {event.location && (
                <p className="text-gray-300 italic mb-2">{event.location}</p>
              )}
              {event.description && (
                <p className="text-neutral-200 mb-3">{event.description}</p>
              )}
              <button
                onClick={() => {
                  setSelectedEvent(event);
                  setShowSignup(true);
                }}
                className="btn-signup"
              >
                Sign Up
              </button>
            </div>
          ))}
        </div>
      )}

      {/* --- Event Signup Modal --- */}
      {selectedEvent && (
        <EventSignupModal
          event={selectedEvent}
          open={showSignup}
          onClose={() => setShowSignup(false)}
        />
      )}
    </section>
  );
}
