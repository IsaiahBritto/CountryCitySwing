"use client";

import { useState, useRef } from "react";
import dayjs from "dayjs";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { parseLocalDate } from "@/lib/utils/dateHelpers";
import EventSignupModal from "@/components/EventSignupModal";
import CompSignupModal from "@/components/CompSignupModal";

export interface CarouselEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  signupLink?: string;
  signup_link?: string;
  description: string;
  price?: number | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  start_time?: string;
  type?: string;
}

interface EventCarouselProps {
  events: CarouselEvent[];
  isAdmin?: boolean;
  onEditEvent?: (event: CarouselEvent) => void;
}

export default function EventCarousel({ events, isAdmin = false, onEditEvent }: EventCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CarouselEvent | null>(null);
  const touchStartX = useRef<number | null>(null);

  // 🧠 Show only upcoming events (today and future)
  const filteredEvents = events.filter((e) =>
    dayjs(e.date).isSame(dayjs(), "day") || dayjs(e.date).isAfter(dayjs(), "day")
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
                      {event.price != null && Number(event.price) >= 0 && (
                        <span className="text-yellow-400 font-semibold">Price: ${Number(event.price).toFixed(2)}</span>
                      )}
                    </div>
                  ) : event.price != null && Number(event.price) >= 0 ? (
                    <p className="text-yellow-400 font-semibold mb-4">
                      Price: ${Number(event.price).toFixed(2)}
                    </p>
                  ) : null}

                  <p className="text-neutral-200 mb-6">{event.description}</p>

                  {/* --- Sign Up / Closed Button --- */}
                  <div className="flex justify-center gap-3">
                    {dayjs(event.date).isBefore(dayjs(), "day") ? (
                      <button
                        disabled
                        className="inline-block bg-gray-500 text-gray-200 font-semibold px-5 py-2 rounded-md cursor-not-allowed opacity-70"
                      >
                        Closed
                      </button>
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

      {/* --- Modals --- */}
      {selectedEvent && selectedEvent.type !== "Comp" && (
        <EventSignupModal
          event={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
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
