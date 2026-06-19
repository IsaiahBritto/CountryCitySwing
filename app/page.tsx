"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
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
    if (typeof window !== "undefined" && window.location.hash === "#events") {
      setTimeout(() => {
        document.getElementById("events")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        "id,title,starts_at,ends_at,location,description,signup_link,time_zone,price,day_of_price,team_day_of_price,ccs_team_price,strictly_price,jnj_price,type"
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
      <section className="text-center pb-12">
        {emailChangeMessage && (
          <div className="max-w-2xl mx-auto mb-6 p-4 rounded-lg bg-primary/20 border border-primary text-left flex items-start gap-3">
            <p className="text-gray-200 text-sm flex-1">
              <strong className="text-primary">Email change (step 1 of 2):</strong> This link is confirmed. To finish changing your email, check the inbox of your <strong>previous email address</strong> and click the link in that message.
            </p>
            <button
              type="button"
              onClick={() => setEmailChangeMessage(null)}
              className="text-gray-400 hover:text-white shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        <Image
          src="/media/logo-dark.jpg"   // 👈 Always dark logo
          alt="Country City Swing Logo"
          width={150}
          height={150}
          className="mx-auto mb-6 drop-shadow-[0_0_12px_rgba(242,201,76,0.45)]"
        />

        <h1 className="gold-wave text-4xl font-extrabold mb-6 pb-2">
          Welcome to Country City Swing
        </h1>

        <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
          Nashville’s home for joyful Country Swing partner dancing —
          where faith, community, and fun meet on the dance floor!
        </p>

        {/* --- NEW weekly class photo --- */}
        {photoLoading ? (
          <div className="relative max-w-3xl mx-auto mb-10 w-full" style={{ aspectRatio: '4/3' }}>
            <div className="w-full h-full bg-neutral-800/50 rounded-lg animate-pulse"></div>
          </div>
        ) : weeklyPhoto && (
          <div className="relative max-w-3xl mx-auto mb-10 w-full">
            {/* --- Gold-glow wrapper --- */}
            <div className="gold-glow rounded-lg p-[0px] bg-gradient-to-br from-yellow-400/70 to-yellow-200/40 relative w-full" style={{ aspectRatio: '4/3' }}>
              <img
                src={weeklyPhoto.link}
                alt={weeklyPhoto.name}
                className="absolute inset-0 w-full h-full object-contain rounded-lg"
              />

              {/* --- Caption overlay --- */}
              <div className="absolute bottom-0 left-0 w-full bg-black/50 text-yellow-300 text-sm sm:text-base font-medium py-2 text-center backdrop-blur-[2px]">
                {weeklyPhoto.name}
              </div>
            </div>
          </div>
        )}


        <div className="flex justify-center flex-wrap gap-4">
          <Link href="/prayer">
            <button className="btn btn-accent">Prayer Request🙏</button>
          </Link>
        </div>
      </section>

      {/* --- Events Section --- */}
      <section className="max-w-5xl mx-auto text-center px-4 pt-10 pb-16 min-h-screen">
        <div id="events" className="relative mb-4 flex flex-col items-center gap-3 md:block md:gap-0 scroll-mt-6">
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

        {/* --- List View (upcoming only, with modal trigger) --- */}
        {!loading && view === "list" && upcomingEvents.length > 0 && (
          <div className="max-w-3xl mx-auto text-left bg-neutral-800 rounded-lg shadow-[0_0_20px_rgba(187,134,252,0.4)] divide-y divide-neutral-700">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="p-5 hover:bg-neutral-700/40">
                <h3 className="text-xl font-bold text-primary mb-1">
                  {event.title}
                </h3>
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
                  ) : event.type === "Convention" && (event.signupLink || event.signup_link) ? (
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

        {/* --- Event Signup Modal (non-Comp; Convention with signup link opens link, no modal) --- */}
        {selectedEvent && selectedEvent.type !== "Comp" && !(selectedEvent.type === "Convention" && (selectedEvent.signupLink || selectedEvent.signup_link)) && (
          <EventSignupModal
            event={selectedEvent}
            open={showSignup}
            onClose={() => setShowSignup(false)}
            isInstructor={isInstructor}
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

        <TheSocialLinksEditorModal
          open={showLinkTreeEditor}
          onClose={() => setShowLinkTreeEditor(false)}
        />
      </section>
    </>
  );
}
