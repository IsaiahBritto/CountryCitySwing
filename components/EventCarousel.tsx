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

const GAP_PX = 12;
/** Each side peek shows at most 1/4 of the active card width: W = (viewport - 2×gap) / 1.5 */
const PEEK_RATIO = 0.25;
const SLIDE_MAX_WIDTH_PX = 480;
export const CAROUSEL_CARD_MIN_HEIGHT_PX = 380;

function slideWidthForViewport(viewportWidth: number): number {
  const fromPeekLayout = (viewportWidth - 2 * GAP_PX) / (1 + 2 * PEEK_RATIO);
  return Math.min(SLIDE_MAX_WIDTH_PX, Math.round(fromPeekLayout));
}

export default function EventCarousel({
  events,
  isAdmin = false,
  isInstructor = false,
  onEditEvent,
}: EventCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [settledIndex, setSettledIndex] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CarouselEvent | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const isTransitioningRef = useRef(false);

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
      indexRef.current = 0;
      setCurrentIndex(0);
      setSettledIndex(0);
    }
  }, [count, currentIndex]);

  const goToIndex = useCallback(
    (computeNext: (index: number) => number) => {
      if (count <= 1 || isTransitioningRef.current) return;
      const nextIndex = computeNext(indexRef.current);
      if (nextIndex === indexRef.current) return;
      indexRef.current = nextIndex;
      setCurrentIndex(nextIndex);

      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        setSettledIndex(nextIndex);
        return;
      }

      isTransitioningRef.current = true;
    },
    [count]
  );

  useEffect(() => {
    if (!isTransitioningRef.current) return;
    const timeout = window.setTimeout(() => {
      if (!isTransitioningRef.current) return;
      isTransitioningRef.current = false;
      setSettledIndex(indexRef.current);
    }, 560);
    return () => window.clearTimeout(timeout);
  }, [currentIndex]);

  const next = useCallback(() => {
    goToIndex((i) => (i === count - 1 ? 0 : i + 1));
  }, [count, goToIndex]);

  const prev = useCallback(() => {
    goToIndex((i) => (i === 0 ? count - 1 : i - 1));
  }, [count, goToIndex]);

  const handleTrackTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
      isTransitioningRef.current = false;
      setSettledIndex(indexRef.current);
    },
    []
  );

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

  const step = slideWidth + GAP_PX;
  const translateX =
    slideWidth > 0
      ? Math.round(
          (viewportWidth - slideWidth) / 2 - currentIndex * step
        )
      : 0;

  const activeTitle = filteredEvents[currentIndex]?.title ?? "";

  return (
    <>
      <section
        ref={regionRef}
        className="event-carousel-root relative mt-10 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded-lg"
        aria-roledescription="carousel"
        aria-label="Event details"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-8 flex items-center justify-center gap-3 sm:gap-4 mb-6">
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

        <div className="event-carousel-bleed">
          <div
            ref={viewportRef}
            className="event-carousel-viewport event-carousel-viewport--screen overflow-hidden touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
          <div
            onTransitionEnd={handleTrackTransitionEnd}
            className={`event-carousel-track flex items-stretch ${
              layoutReady && slideWidth > 0
                ? "event-carousel-track--interactive opacity-100"
                : "opacity-0"
            }`}
            style={{
              gap: GAP_PX,
              transform: useCenteredTrack ? `translate3d(${translateX}px, 0, 0)` : undefined,
            }}
          >
            {filteredEvents.map((event, index) => {
              const theme = resolveEventCarouselTheme({
                type: event.type,
                title: event.title,
              });
              const isActive = index === settledIndex;
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
