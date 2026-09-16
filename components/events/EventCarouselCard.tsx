"use client";

import { CcsButton } from "@/components/ccs";
import type { EventCarouselTheme } from "@/lib/design/eventCarouselTheme";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
  isEventPast,
} from "@/lib/utils/dateHelpers";
import { resolveSignupListPrice } from "@/lib/utils/workshopPricing";
import {
  CAROUSEL_CARD_MIN_HEIGHT_PX,
  type CarouselEvent,
} from "@/components/EventCarousel";

function eventDisplayPrice(event: CarouselEvent, isInstructor: boolean): number | null | undefined {
  if (event.price == null && event.ccs_team_price == null) return event.price;
  return resolveSignupListPrice(event, { isCcsTeam: isInstructor });
}

type Props = {
  event: CarouselEvent;
  theme: EventCarouselTheme;
  isActive: boolean;
  isInstructor: boolean;
  isAdmin: boolean;
  onSignUp: (event: CarouselEvent) => void;
  onEdit?: (event: CarouselEvent) => void;
};

export default function EventCarouselCard({
  event,
  theme,
  isActive,
  isInstructor,
  isAdmin,
  onSignUp,
  onEdit,
}: Props) {
  const past = isEventPast(
    event.starts_at,
    event.ends_at ?? undefined,
    event.time_zone || DEFAULT_TIME_ZONE
  );

  const borderStyle = isActive
    ? { borderColor: theme.borderColor, borderWidth: 2 }
    : undefined;

  return (
    <article
      className={`event-carousel-slide w-full h-full flex flex-col bg-neutral-800 rounded-lg p-6 text-center shadow-lg transition-all duration-300 ${
        isActive
          ? "event-carousel-slide--active opacity-100"
          : "event-carousel-slide--peek opacity-55 border border-neutral-700"
      }`}
      style={{ ...borderStyle, minHeight: CAROUSEL_CARD_MIN_HEIGHT_PX }}
      aria-hidden={!isActive}
    >
      <h3
        className="text-2xl font-bold mb-2"
        style={{
          color: theme.titleColor,
          textShadow: isActive ? theme.titleGlow : theme.titleGlowPeek,
        }}
      >
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

      <p className="text-gray-400 italic mb-2">📍 {event.location}</p>

      {event.type === "Comp" ? (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-2">
          {event.strictly_price != null && Number(event.strictly_price) >= 0 && (
            <span className="text-primary font-semibold">
              Strictly: ${Number(event.strictly_price).toFixed(2)}
            </span>
          )}
          {event.jnj_price != null && Number(event.jnj_price) >= 0 && (
            <span className="text-primary font-semibold">
              JnJ: ${Number(event.jnj_price).toFixed(2)}
            </span>
          )}
          {eventDisplayPrice(event, isInstructor) != null &&
            Number(eventDisplayPrice(event, isInstructor)) >= 0 && (
              <span className="text-primary font-semibold">
                Price: ${Number(eventDisplayPrice(event, isInstructor)).toFixed(2)}
              </span>
            )}
        </div>
      ) : eventDisplayPrice(event, isInstructor) != null &&
        Number(eventDisplayPrice(event, isInstructor)) >= 0 ? (
        <p className="text-primary font-semibold mb-4">
          Price: ${Number(eventDisplayPrice(event, isInstructor)).toFixed(2)}
        </p>
      ) : null}

      <p className="text-neutral-200 mb-6 flex-grow line-clamp-6">{event.description}</p>

      <div className="flex justify-center gap-3 mt-auto">
        {past ? (
          <button
            type="button"
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
            className="ccs-btn ccs-btn--solid-gold normal-case"
          >
            Sign Up
          </a>
        ) : (
          <CcsButton
            type="button"
            variant="solidGold"
            onClick={() => onSignUp(event)}
            className="normal-case"
          >
            Sign Up
          </CcsButton>
        )}
        {isAdmin && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="px-4 py-2 rounded-md bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
          >
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
