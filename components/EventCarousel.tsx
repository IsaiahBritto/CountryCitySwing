"use client";

import { useState, useRef } from "react";
import dayjs from "dayjs";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
  isEventPast,
} from "@/lib/utils/dateHelpers";
import { resolveSignupListPrice, type PriceChange } from "@/lib/utils/workshopPricing";
import EventSignupModal from "@/components/EventSignupModal";
import CompSignupModal from "@/components/CompSignupModal";

export interface CarouselEvent {
  id: number;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location: string;
  signupLink?: string;
  signup_link?: string;
  time_zone?: string | null;
  description: string;
  price?: number | null;
  price_changes?: PriceChange[] | null;
  ccs_team_price_changes?: PriceChange[] | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  ccs_team_price?: number | null;
  type?: string;
}

function eventDisplayPrice(event: CarouselEvent, isInstructor: boolean): number | null | undefined {
  if (event.price == null && event.ccs_team_price == null) return event.price;
  return resolveSignupListPrice(event, { isCcsTeam: isInstructor });
}

interface EventCarouselProps {
  events: CarouselEvent[];
  isAdmin?: boolean;
  isInstructor?: boolean;
  onEditEvent?: (event: CarouselEvent) => void;
}

export default function EventCarousel({ events, isAdmin = false, isInstructor = false, onEditEvent }: EventCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CarouselEvent | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Show only upcoming events (today and future in Nashville/Chicago time)
  const filteredEvents = events.filter((e) =>
    !isEventPast(e.starts_at, e.ends_at ?? undefined, e.time_zone || DEFAULT_TIME_ZONE)
  );

  if (filteredEvents.length === 0) {
    return (
      <p className="text-gray-400 text-center mt-10">
        No current or upcoming events at this time.
      </p>
    );
  }

  const next = () =>
    setCurrentIndex((i) => (i === filteredEvents.length - 1 ? 0 : i + 1));
  const prev = () =>
    setCurrentIndex((i) => (i === 0 ? filteredEvents.length - 1 : i - 1));

  // --- Swipe for mobile ---
  const handleTouchStart = (e: React.TouchEvent) =>
    (touchStartX.current = e.touches[0].clientX);

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

  return (
    <>
      <div className="relative mx-auto mt-10 max-w-[650px] px-4">
        {/* --- Carousel window --- */}
        <div
          className="overflow-hidden rounded-lg w-full"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* --- Track --- */}
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{
              transform: `translateX(-${currentIndex * 100}%)`,
            }}
          >
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="shrink-0 flex justify-center items-stretch w-full"
                style={{ flexBasis: "100%" }}
              >
                {/* --- Event Card --- */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6 text-center shadow-lg hover:shadow-glow transition-all w-full max-w-[600px]">
                  <h3 className="text-2xl font-bold text-primary mb-2">
                    {event.title}
                  </h3>
                  {event.type === "Convention" && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 mb-2">
                      Convention
                    </span>
                  )}
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

                  <p className="text-gray-400 italic mb-2">
                    📍 {event.location}
                  </p>
                  {event.type === "Comp" ? (
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-2">
                      {event.strictly_price != null && Number(event.strictly_price) >= 0 && (
                        <span className="text-yellow-400 font-semibold">Strictly: ${Number(event.strictly_price).toFixed(2)}</span>
                      )}
                      {event.jnj_price != null && Number(event.jnj_price) >= 0 && (
                        <span className="text-yellow-400 font-semibold">JnJ: ${Number(event.jnj_price).toFixed(2)}</span>
                      )}
                      {eventDisplayPrice(event, isInstructor) != null && Number(eventDisplayPrice(event, isInstructor)) >= 0 && (
                        <span className="text-yellow-400 font-semibold">Price: ${Number(eventDisplayPrice(event, isInstructor)).toFixed(2)}</span>
                      )}
                    </div>
                  ) : eventDisplayPrice(event, isInstructor) != null && Number(eventDisplayPrice(event, isInstructor)) >= 0 ? (
                    <p className="text-yellow-400 font-semibold mb-4">
                      Price: ${Number(eventDisplayPrice(event, isInstructor)).toFixed(2)}
                    </p>
                  ) : null}

                  <p className="text-neutral-200 mb-6">{event.description}</p>

                  {/* --- Sign Up / Closed Button --- */}
                  <div className="flex justify-center gap-3">
                    {isEventPast(event.starts_at, event.ends_at ?? undefined, event.time_zone || DEFAULT_TIME_ZONE) ? (
                      <button
                        disabled
                        className="inline-block bg-gray-500 text-gray-200 font-semibold px-5 py-2 rounded-md cursor-not-allowed opacity-70"
                      >
                        Closed
                      </button>
                    ) : event.type === "Convention" && (event.signupLink || event.signup_link) ? (
                      <a
                        href={event.signupLink || event.signup_link || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-signup inline-block"
                      >
                        Sign Up
                      </a>
                    ) : event.type === "Comp" ? (
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="btn-signup inline-block text-center"
                      >
                        Sign Up
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="btn-signup inline-block"
                      >
                        Sign Up
                      </button>
                    )}
                    {isAdmin && onEditEvent && (
                      <button
                        onClick={() => onEditEvent(event)}
                        className="px-4 py-2 rounded-md bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --- Arrows --- */}
        <button
          onClick={prev}
          aria-label="Previous event"
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-neutral-700 hover:bg-neutral-600 text-white p-2 rounded-full shadow-md"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>

        <button
          onClick={next}
          aria-label="Next event"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-neutral-700 hover:bg-neutral-600 text-white p-2 rounded-full shadow-md"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>

        {/* --- Dots --- */}
        <div className="flex justify-center mt-4 space-x-2">
          {filteredEvents.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? "bg-primary" : "bg-neutral-600"
              }`}
            />
          ))}
        </div>
      </div>

      {/* --- Modals (Convention with signup link opens link, no modal) --- */}
      {selectedEvent && selectedEvent.type !== "Comp" && !(selectedEvent.type === "Convention" && (selectedEvent.signupLink || selectedEvent.signup_link)) && (
        <EventSignupModal
          event={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          isInstructor={isInstructor}
        />
      )}
      {selectedEvent && selectedEvent.type === "Comp" && (
        <CompSignupModal
          event={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}
