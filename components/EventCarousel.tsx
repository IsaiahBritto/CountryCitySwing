"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import {
  DEFAULT_TIME_ZONE,
  isEventPast,
} from "@/lib/utils/dateHelpers";
import EventSignupModal from "@/components/EventSignupModal";
import CompSignupModal from "@/components/CompSignupModal";
import EventCarouselCard from "@/components/events/EventCarouselCard";
import { resolveEventCarouselTheme } from "@/lib/design/eventCarouselTheme";
import type { PriceChange } from "@/lib/utils/workshopPricing";

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

interface EventCarouselProps {
  events: CarouselEvent[];
  isAdmin?: boolean;
  isInstructor?: boolean;
  onEditEvent?: (event: CarouselEvent) => void;
}

const GAP_PX = 16;
const SLIDE_WIDTH_RATIO_MOBILE = 0.68;
const SLIDE_WIDTH_RATIO_DESKTOP = 0.6;
const SLIDE_MAX_WIDTH_PX = 480;
export const CAROUSEL_CARD_MIN_HEIGHT_PX = 380;

function slideWidthForViewport(viewportWidth: number): number {
  if (viewportWidth < 640) return viewportWidth * SLIDE_WIDTH_RATIO_MOBILE;
  return Math.min(SLIDE_MAX_WIDTH_PX, viewportWidth * SLIDE_WIDTH_RATIO_DESKTOP);
}

export default function EventCarousel({
  events,
  isAdmin = false,
  isInstructor = false,
  onEditEvent,
}: EventCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CarouselEvent | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const filteredEvents = events.filter(
    (e) => !isEventPast(e.starts_at, e.ends_at ?? undefined, e.time_zone || DEFAULT_TIME_ZONE)
  );

  const count = filteredEvents.length;
  const slideWidth = viewportWidth > 0 ? slideWidthForViewport(viewportWidth) : 0;
  const useCenteredTrack = slideWidth > 0;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setViewportWidth(el.clientWidth);
      setLayoutReady(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (currentIndex >= count && count > 0) {
      setCurrentIndex(0);
    }
  }, [count, currentIndex]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (count <= 1 ? 0 : i === count - 1 ? 0 : i + 1));
  }, [count]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => (count <= 1 ? 0 : i === 0 ? count - 1 : i - 1));
  }, [count]);

  const handleSignUp = (event: CarouselEvent) => {
    if (event.type === "Convention" && (event.signupLink || event.signup_link)) {
      return;
    }
    setSelectedEvent(event);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || count <= 1) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (count <= 1) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  if (count === 0) {
    return (
      <p className="text-gray-400 text-center mt-10">
        No current or upcoming events at this time.
      </p>
    );
  }

  const translateX =
    slideWidth > 0
      ? viewportWidth / 2 -
        currentIndex * (slideWidth + GAP_PX) -
        slideWidth / 2
      : 0;

  const activeTitle = filteredEvents[currentIndex]?.title ?? "";

  return (
    <>
      <section
        ref={regionRef}
        className="relative mx-auto mt-10 max-w-5xl px-4 sm:px-8 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded-lg"
        aria-roledescription="carousel"
        aria-label="Event details"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6">
          <button
            type="button"
            onClick={prev}
            disabled={count <= 1}
            aria-label="Previous event"
            className="event-carousel-nav-btn shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>

          <h2 className="ccs-text-gold-wave gold-wave ccs-section-title text-center flex-1 mb-0 pb-0">
            Event Details
          </h2>

          <button
            type="button"
            onClick={next}
            disabled={count <= 1}
            aria-label="Next event"
            className="event-carousel-nav-btn shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {activeTitle}
        </p>

        <div
          ref={viewportRef}
          className="event-carousel-viewport overflow-hidden w-full"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className={`event-carousel-track flex items-stretch transition-opacity duration-200 ${
              layoutReady && slideWidth > 0 ? "opacity-100" : "opacity-0"
            }`}
            style={{
              gap: GAP_PX,
              transform: useCenteredTrack ? `translateX(${translateX}px)` : undefined,
            }}
          >
            {filteredEvents.map((event, index) => {
              const theme = resolveEventCarouselTheme({
                type: event.type,
                title: event.title,
              });
              const isActive = index === currentIndex;
              return (
                <div
                  key={event.id}
                  className="shrink-0 flex flex-col"
                  style={{
                    width: slideWidth > 0 ? slideWidth : undefined,
                    minHeight: CAROUSEL_CARD_MIN_HEIGHT_PX,
                  }}
                >
                  <EventCarouselCard
                    event={event}
                    theme={theme}
                    isActive={isActive}
                    isInstructor={isInstructor}
                    isAdmin={isAdmin}
                    onSignUp={handleSignUp}
                    onEdit={onEditEvent}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selectedEvent &&
        selectedEvent.type !== "Comp" &&
        !(
          selectedEvent.type === "Convention" &&
          (selectedEvent.signupLink || selectedEvent.signup_link)
        ) && (
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
