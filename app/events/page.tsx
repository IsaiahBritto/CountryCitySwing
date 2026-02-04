"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Calendar from "@/components/Calendar";
import WorkshopSpotlight from "@/components/WorkshopSpotlight";
import EventCarousel from "@/components/EventCarousel";
import EventSignupModal from "@/components/EventSignupModal";
import CompSignupModal from "@/components/CompSignupModal";
import EventFormModal from "@/components/EventFormModal";
import EventsListSkeleton from "@/components/EventsListSkeleton";
import { parseLocalDate } from "@/lib/utils/dateHelpers";

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState<"dynamic" | "list">("dynamic");
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showSignup, setShowSignup] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (user) {
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setIsAdmin(profile?.role === "admin");
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      setEvents([]);
    } else {
      // Normalize snake_case to camelCase for frontend components
      const normalizedEvents = (data || []).map((event: any) => ({
        ...event,
        signupLink: event.signup_link || event.signupLink || "",
        time: undefined,
      }));
      setEvents(normalizedEvents);
    }
    setLoading(false);
  };

  // Filter upcoming events only (today and future)
  const today = dayjs().startOf("day");
  const upcomingEvents = events.filter((e) =>
    dayjs(e.date).isSame(today, "day") || dayjs(e.date).isAfter(today, "day")
  );

  const handleEventSaved = () => {
    loadEvents();
  };

  const handleEditEvent = (event: any) => {
    setEventToEdit(event);
    setShowEventForm(true);
  };

  const handleAddEvent = () => {
    setEventToEdit(null);
    setShowEventForm(true);
  };

  return (
    <section className="max-w-5xl mx-auto text-center px-4">
      <div className="relative mb-4 flex flex-col items-center gap-3 md:block md:gap-0">
        <h2 className="gold-wave text-4xl font-extrabold pb-2 text-center">
          Upcoming Events
        </h2>
        {isAdmin && (
          <div className="md:absolute md:right-0 md:top-0 shrink-0">
            <button
              onClick={handleAddEvent}
              className="btn-signup text-sm px-4 py-2 rounded-md"
            >
              Add Event
            </button>
          </div>
        )}
      </div>

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
        <div className="mb-8">
          <EventsListSkeleton />
        </div>
      )}
      {!loading && upcomingEvents.length === 0 && (
        <p className="text-gray-400 mb-8">No upcoming events yet.</p>
      )}

      {/* --- Dynamic View --- */}
      {!loading && view === "dynamic" && upcomingEvents.length > 0 && (
        <div className="space-y-10">
          <section className="max-w-5xl mx-auto text-center px-4">
            <WorkshopSpotlight 
              events={upcomingEvents} 
              isAdmin={isAdmin}
              onEditEvent={handleEditEvent}
            />
            <Calendar 
              events={events} 
              isAdmin={isAdmin}
              onEditEvent={handleEditEvent}
            />
            <EventCarousel 
              events={upcomingEvents} 
              isAdmin={isAdmin}
              onEditEvent={handleEditEvent}
            />
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
                {event.start_time
                  ? ` • ${new Date(event.start_time).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : ""}
              </p>
              {event.location && (
                <p className="text-gray-300 italic mb-2">{event.location}</p>
              )}
              {event.description && (
                <p className="text-neutral-200 mb-3">{event.description}</p>
              )}
              <div className="flex justify-center gap-3">
                {event.type === "Comp" ? (
                  <button
                    onClick={() => {
                      setSelectedEvent(event);
                      setShowSignup(true);
                    }}
                    className="btn-signup"
                  >
                    Sign Up
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedEvent(event);
                      setShowSignup(true);
                    }}
                    className="btn-signup"
                  >
                    Sign Up
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleEditEvent(event)}
                    className="px-4 py-2 rounded-md bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- Event Signup Modal (non-Comp events) --- */}
      {selectedEvent && selectedEvent.type !== "Comp" && (
        <EventSignupModal
          event={selectedEvent}
          open={showSignup}
          onClose={() => setShowSignup(false)}
        />
      )}
      {/* --- Comp Signup Modal (How's My Dancing) --- */}
      {selectedEvent && selectedEvent.type === "Comp" && (
        <CompSignupModal
          event={selectedEvent}
          open={showSignup}
          onClose={() => setShowSignup(false)}
        />
      )}

      {/* --- Event Form Modal (Add/Edit) --- */}
      <EventFormModal
        open={showEventForm}
        onClose={() => {
          setShowEventForm(false);
          setEventToEdit(null);
        }}
        event={eventToEdit}
        onSuccess={handleEventSaved}
      />
    </section>
  );
}
