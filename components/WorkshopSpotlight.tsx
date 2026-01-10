import dayjs from "dayjs";

import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
dayjs.extend(isSameOrAfter);  

import { CarouselEvent } from "./EventCarousel";

interface WorkshopSpotlightProps {
  events: CarouselEvent[];
}

export default function WorkshopSpotlight({ events }: WorkshopSpotlightProps) {
  const today = dayjs().startOf("day");

  // find the closest upcoming workshop (not in the past)
  const upcomingWorkshop = events
    .filter(
      (e) =>
        e.type === "Workshop" &&
        dayjs(e.date).isSameOrAfter(today, "day")
    )
    .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))[0];

  if (!upcomingWorkshop) return null;

  return (
    <div className="bg-neutral-800 border border-yellow-500/30 rounded-lg p-6 shadow-lg mb-10 max-w-3xl mx-auto">
      <h3 className="text-2xl font-bold text-primary mb-3">
        Workshop Spotlight
      </h3>
      <h4 className="text-xl font-semibold text-yellow-300 mb-1">
        {upcomingWorkshop.title}
      </h4>
      <p className="text-gray-400 mb-1">
        {new Date(upcomingWorkshop.date).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <p className="text-gray-400 italic mb-3">
        📍 {upcomingWorkshop.location}
      </p>
      <p className="text-neutral-200 mb-5">{upcomingWorkshop.description}</p>
      <a
        href={upcomingWorkshop.signupLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-primary text-black font-semibold px-5 py-2 rounded-md hover:bg-yellow-400 transition-colors"
      >
        Sign Up
      </a>
    </div>
  );
}
