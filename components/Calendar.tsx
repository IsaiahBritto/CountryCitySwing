"use client";

import { useState } from "react";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isoWeek from "dayjs/plugin/isoWeek";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { StarIcon, XMarkIcon } from "@heroicons/react/24/solid";
import EventSignupModal from "@/components/EventSignupModal";

dayjs.extend(weekday);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

interface CalendarEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  signupLink: string;
  description: string;
  cost?: number;
  time?: string;
  type?: string;
}

interface CalendarProps {
  events?: CalendarEvent[];
}

const today = dayjs().format("YYYY-MM-DD");

export default function Calendar({ events = [] }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const daysInMonth = currentMonth.daysInMonth();
  const firstDayOfMonth = currentMonth.startOf("month").day();
  const startDayIndex = firstDayOfMonth;

  // build weeks
  const weeks: (number | null)[][] = [];
  let currentDay = 1 - startDayIndex;
  while (currentDay <= daysInMonth) {
    const week: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (currentDay > 0 && currentDay <= daysInMonth) week.push(currentDay);
      else week.push(null);
      currentDay++;
    }
    weeks.push(week);
  }

  const nextMonth = () => setCurrentMonth(currentMonth.add(1, "month"));
  const prevMonth = () => setCurrentMonth(currentMonth.subtract(1, "month"));

  const getEventForDay = (day: number) => {
    const dateStr = currentMonth.date(day).format("YYYY-MM-DD");
    return events.find((e) => e.date === dateStr);
  };

  const openEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsVisible(true);
  };

  const closeEvent = () => {
    setIsVisible(false);
    setTimeout(() => setSelectedEvent(null), 200);
  };

  const closeAll = () => {
    setIsVisible(false);
    setShowSignup(false);
    setSelectedEvent(null);
  };

  return (
    <>
      <div className="bg-neutral-800 text-neutral-100 rounded-lg p-6 shadow-lg max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={prevMonth}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
          >
            ←
          </button>
          <h2 className="text-xl font-semibold text-primary">
            {currentMonth.format("MMMM YYYY")}
          </h2>
          <button
            onClick={nextMonth}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
          >
            →
          </button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 gap-2 text-center font-semibold mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-sm text-gray-300">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-2 text-center">
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              const event = day ? getEventForDay(day) : null;
              return (
                <div
                  key={`${wi}-${di}`}
                  onClick={() => {
                    if (event) openEvent(event);
                  }}
                  className={`group h-16 flex flex-col justify-center items-center rounded-md transition cursor-pointer overflow-hidden
                    ${
                      event
                        ? event.type === "Workshop"
                          ? "bg-yellow-400/50 text-black hover:bg-yellow-400"
                          : "bg-primary text-black hover:bg-yellow-400"
                        : "bg-neutral-900 text-gray-300"
                    }
                    ${
                      day &&
                      currentMonth.date(day).format("YYYY-MM-DD") === today
                        ? "ring-2 ring-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]"
                        : ""
                    }`}
                >
                  {day && <span className="font-medium text-base">{day}</span>}
                  {event && (
                    <StarIcon className="w-4 h-4 mt-1 transition-colors text-yellow-400 group-hover:text-black" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL for event details */}
      {selectedEvent && !showSignup && (
        <div
          className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-200 
            ${isVisible ? "opacity-100" : "opacity-0"} 
            bg-black/60 backdrop-blur-sm`}
          onClick={closeEvent}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative bg-neutral-900 text-neutral-100 rounded-lg shadow-lg max-w-md w-full p-6 mx-4 border border-neutral-700 transform transition-all duration-200
              ${isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
          >
            {/* Close button */}
            <button
              className="absolute top-3 right-3 text-neutral-400 hover:text-primary"
              onClick={closeEvent}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <h3 className="text-2xl font-bold text-primary mb-2">
              {selectedEvent.title}
            </h3>
            <p className="text-gray-400 mb-2">
              {dayjs(selectedEvent.date).format("dddd, MMMM D, YYYY")}
              {selectedEvent.time && ` • ${selectedEvent.time}`}
            </p>
            <p className="text-gray-300 mb-4 italic">
              📍 {selectedEvent.location}
            </p>
            <p className="text-neutral-200 leading-relaxed mb-6">
              {selectedEvent.description}
            </p>

            {/* Signup button or Closed state */}
            {dayjs(selectedEvent.date).isBefore(dayjs(), "day") ? (
              <button
                disabled
                className="inline-block bg-gray-500 text-gray-200 font-semibold px-5 py-2 rounded-md cursor-not-allowed opacity-70"
              >
                Closed
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsVisible(false);   // close event details
                  setShowSignup(true);   // open signup modal
                }}
                className="btn-signup inline-block"
              >
                Sign Up
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- Event Signup Modal --- */}
      {selectedEvent && (
        <EventSignupModal
          event={selectedEvent}
          open={showSignup}
          onClose={closeAll}
        />
      )}
    </>
  );
}
