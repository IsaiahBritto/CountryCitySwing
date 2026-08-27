"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Calendar from "@/components/Calendar";
import WorkshopSpotlight from "@/components/WorkshopSpotlight";
import EventCarousel from "@/components/EventCarousel";
import EventSignupModal from "@/components/EventSignupModal";
import CompSignupModal from "@/components/CompSignupModal";
import EventFormModal from "@/components/EventFormModal";
import TheSocialLinksEditorModal from "@/components/TheSocialLinksEditorModal";
import EventsListSkeleton from "@/components/EventsListSkeleton";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
  getDateStringInTimeZone,
} from "@/lib/utils/dateHelpers";

export default function TestEventsSection() {
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState<"dynamic" | "list">("dynamic");
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showSignup, setShowSignup] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showLinkTreeEditor, setShowLinkTreeEditor] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const roleLower = (data.profile?.role ?? "").toLowerCase();
        setIsAdmin(roleLower === "admin");
        setIsInstructor(roleLower === "instructor");
      } catch {
        // ignore
      }
    };
    checkRole();
  }, []);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id,title,starts_at,ends_at,location,description,signup_link,time_zone,price,price_changes,ccs_team_price,ccs_team_price_changes,strictly_price,jnj_price,strictly_level,jnj_level,type,refund_statement,all_three_classes"
      )
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      setEvents([]);
    } else {
      const normalizedEvents = (data || []).map((event: any) => ({
        ...event,
        signupLink: event.signup_link || event.signupLink || "",
        time: undefined,
      }));
      setEvents(normalizedEvents);
    }
    setLoading(false);
  };

  const upcomingEvents = events.filter((e) => {
    const tz = e.time_zone || DEFAULT_TIME_ZONE;
    const today = getDateStringInTimeZone(new Date().toISOString(), tz);
    const endOrStart = e.ends_at ?? e.starts_at;
    const eventEndDate = getDateStringInTimeZone(endOrStart, tz);
    if (!today || !eventEndDate) return true;
    return today <= eventEndDate;
  });

  const handleEventSaved = () => {
    loadEvents();
    emitCcsSuccessToast(
      eventToEdit ? "Event updated successfully." : "Event created successfully."
    );
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
    <section
      id="events"
      data-ep-section="events"
      className="event-page-section relative max-w-5xl mx-auto text-center px-4 pt-6 pb-16 min-h-[85vh] scroll-mt-6"
    >
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
              ? "bg-accent text-white shadow-[0_0_20px_rgba(187,134,252,0.6)]"
              : "bg-neutral-800 text-gray-300 hover:bg-neutral-700"
          }`}
        >
          List View
        </button>
      </div>

      {loading && (
        <div className="mb-8">
          <EventsListSkeleton />
        </div>
      )}
      {!loading && upcomingEvents.length === 0 && (
        <p className="text-gray-400 mb-8">No upcoming events yet.</p>
      )}

      {!loading && view === "dynamic" && upcomingEvents.length > 0 && (
        <div className="space-y-10">
          <section className="max-w-5xl mx-auto text-center px-4">
            <WorkshopSpotlight
              events={upcomingEvents}
              isAdmin={isAdmin}
              isInstructor={isInstructor}
              onEditEvent={handleEditEvent}
            />
            <Calendar
              events={events}
              isAdmin={isAdmin}
              isInstructor={isInstructor}
              onEditEvent={handleEditEvent}
            />
            <EventCarousel
              events={upcomingEvents}
              isAdmin={isAdmin}
              isInstructor={isInstructor}
              onEditEvent={handleEditEvent}
            />
          </section>
        </div>
      )}

      {!loading && view === "list" && upcomingEvents.length > 0 && (
        <div className="max-w-3xl mx-auto text-left bg-neutral-800 rounded-lg shadow-[0_0_20px_rgba(187,134,252,0.4)] divide-y divide-neutral-700">
          {upcomingEvents.map((event) => (
            <div key={event.id} className="p-5 hover:bg-neutral-700/40">
              <h3 className="text-xl font-bold text-primary mb-1">{event.title}</h3>
              <p className="text-gray-400 mb-1">
                {event.starts_at
                  ? formatEventScheduleSubtitle(
                      event.starts_at,
                      event.ends_at,
                      event.time_zone || DEFAULT_TIME_ZONE,
                      event.type
                    )
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
                ) : event.type === "Convention" &&
                  (event.signupLink || event.signup_link) ? (
                  <a
                    href={event.signupLink || event.signup_link || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-signup"
                  >
                    Sign Up
                  </a>
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

      {isAdmin && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setShowLinkTreeEditor(true)}
            className="btn-signup text-sm px-4 py-2 rounded-md"
          >
            Edit Link Tree
          </button>
        </div>
      )}

      {selectedEvent &&
        selectedEvent.type !== "Comp" &&
        !(
          selectedEvent.type === "Convention" &&
          (selectedEvent.signupLink || selectedEvent.signup_link)
        ) && (
          <EventSignupModal
            event={selectedEvent}
            open={showSignup}
            onClose={() => setShowSignup(false)}
            isInstructor={isInstructor}
          />
        )}
      {selectedEvent && selectedEvent.type === "Comp" && (
        <CompSignupModal
          event={selectedEvent}
          open={showSignup}
          onClose={() => setShowSignup(false)}
        />
      )}

      <EventFormModal
        open={showEventForm}
        onClose={() => {
          setShowEventForm(false);
          setEventToEdit(null);
        }}
        event={eventToEdit}
        onSuccess={handleEventSaved}
        existingEvents={events}
      />

      <TheSocialLinksEditorModal
        open={showLinkTreeEditor}
        onClose={() => setShowLinkTreeEditor(false)}
      />
    </section>
  );
}
