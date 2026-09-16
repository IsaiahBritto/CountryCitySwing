"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import HomeHero from "@/components/home/HomeHero";
import FindInstructorsCta from "@/components/home/FindInstructorsCta";
import UpcomingEventsSection from "@/components/home/UpcomingEventsSection";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Calendar from "@/components/Calendar";
import WorkshopSpotlight from "@/components/WorkshopSpotlight";
import EventCarousel from "@/components/EventCarousel";
import EventSignupModal from "@/components/EventSignupModal";
import CompSignupModal from "@/components/CompSignupModal";
import CompsHubBanner from "@/components/CompsHubBanner";
import EventFormModal from "@/components/EventFormModal";
import TheSocialLinksEditorModal from "@/components/TheSocialLinksEditorModal";
import EventsListSkeleton from "@/components/EventsListSkeleton";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
  getDateStringInTimeZone,
} from "@/lib/utils/dateHelpers";

interface WeeklyPhoto {
  id: string;
  name: string;
  link: string;
}

export default function Home() {
  const [weeklyPhoto, setWeeklyPhoto] = useState<WeeklyPhoto | null>(null);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(null);

  // Events State
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
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash === "#events") {
      window.history.replaceState(null, "", "/#upcoming-events");
      setTimeout(() => {
        document.getElementById("upcoming-events")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }
    if (hash === "#upcoming-events") {
      setTimeout(() => {
        document.getElementById("upcoming-events")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, []);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const params = hash ? new URLSearchParams(hash.replace(/^#/, "")) : null;
    const message = params?.get("message");
    if (message && message.includes("Confirmation link accepted") && message.includes("other email")) {
      setEmailChangeMessage(message.replace(/\+/g, " "));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    async function loadPhoto() {
      try {
        const res = await fetch("/api/weekly-photo");
        const data = await res.json();
        if (data.file || data.link) {
          setWeeklyPhoto(data.file ? data.file : data);
        }
      } catch (err) {
        console.error("Error loading weekly photo:", err);
      } finally {
        setPhotoLoading(false);
      }
    }
    loadPhoto();
  }, []);

  useEffect(() => {
    const checkRole = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
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
        "id,title,starts_at,ends_at,location,description,signup_link,time_zone,price,price_changes,ccs_team_price,ccs_team_price_changes,strictly_price,jnj_price,strictly_level,jnj_level,type,refund_statement,all_three_classes,upper_level_lead_capacity,upper_level_follow_capacity"
      )
      .order("starts_at", { ascending: true });

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

  // Filter upcoming events only (today and future in Nashville/Chicago time)
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
    <>
      <HomeHero
        photoLoading={photoLoading}
        weeklyPhoto={weeklyPhoto}
        emailChangeMessage={emailChangeMessage}
        onDismissEmailMessage={() => setEmailChangeMessage(null)}
      />

      <UpcomingEventsSection
        isAdmin={isAdmin}
        onAddEvent={handleAddEvent}
        view={view}
        onViewChange={setView}
        loading={loading}
        loadingFallback={
          <div className="mb-8">
            <EventsListSkeleton />
          </div>
        }
        hasUpcoming={upcomingEvents.length > 0}
        dynamicView={
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
              <CompsHubBanner />
              <EventCarousel
                events={upcomingEvents}
                isAdmin={isAdmin}
                isInstructor={isInstructor}
                onEditEvent={handleEditEvent}
              />
            </section>
          </div>
        }
        listView={
          <>
            <CompsHubBanner className="mb-6" />
            <div className="max-w-3xl mx-auto text-left ccs-card shadow-[0_0_20px_rgba(187,134,252,0.4)] divide-y divide-neutral-700">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="p-5 hover:bg-neutral-700/40">
                  <h3 className="text-xl font-bold text-event-title mb-1">{event.title}</h3>
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
          </>
        }
        adminTools={
          isAdmin ? (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setShowLinkTreeEditor(true)}
                className="btn-signup text-sm px-4 py-2 rounded-md"
              >
                Edit Link Tree
              </button>
            </div>
          ) : null
        }
        modals={
          <>
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
          </>
        }
      />

      <FindInstructorsCta />
    </>
  );
}
