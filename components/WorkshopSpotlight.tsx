"use client";

import { useState } from "react";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { parseLocalDate } from "@/lib/utils/dateHelpers";
import EventSignupModal from "@/components/EventSignupModal";
import { CarouselEvent } from "./EventCarousel";

dayjs.extend(isSameOrAfter);

interface WorkshopSpotlightProps {
  events: CarouselEvent[];
}

export default function WorkshopSpotlight({ events }: WorkshopSpotlightProps) {
  const today = dayjs().startOf("day");
  const [showSignup, setShowSignup] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CarouselEvent | null>(null);

  // find the closest upcoming workshop (not in the past)
  const upcomingWorkshop = events
    .filter(
      (e) =>
        e.type === "Workshop" &&
        dayjs(e.date).isSameOrAfter(today, "day")
    )
    .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))[0];

  if (!upcomingWorkshop) return null;

  const openSignup = () => {
    setSelectedEvent(upcomingWorkshop);
    setShowSignup(true);
  };

  const closeSignup = () => setShowSignup(false);

  return (
    <>
      <div className="bg-neutral-800 border border-yellow-500/30 rounded-lg p-6 shadow-lg mb-10 max-w-3xl mx-auto">
        <h3 className="text-2xl font-bold text-primary mb-3">
          Workshop Spotlight
        </h3>
        <h4 className="text-xl font-semibold text-yellow-300 mb-1">
          {upcomingWorkshop.title}
        </h4>
        <p className="text-gray-400 mb-1">
          {parseLocalDate(upcomingWorkshop.date).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          {upcomingWorkshop.time && ` • ${upcomingWorkshop.time}`}
        </p>
        <p className="text-gray-400 italic mb-3">
          📍 {upcomingWorkshop.location}
        </p>
        <p className="text-neutral-200 mb-5">{upcomingWorkshop.description}</p>

        {dayjs(upcomingWorkshop.date).isBefore(dayjs(), "day") ? (
          <button
            disabled
            className="inline-block bg-gray-500 text-gray-200 font-semibold px-5 py-2 rounded-md cursor-not-allowed opacity-70"
          >
            Closed
          </button>
        ) : (
          <button onClick={openSignup} className="btn-signup">
            Sign Up
          </button>
        )}
      </div>

      {/* --- Signup Modal --- */}
      <EventSignupModal
        event={selectedEvent}
        open={showSignup}
        onClose={closeSignup}
      />
    </>
  );
}
