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
  signupLink?: string;
  signup_link?: string;
  description: string;
  price?: number;
  start_time?: string;
  type?: string;
}

interface CalendarProps {
  events?: CalendarEvent[];
  isAdmin?: boolean;
  onEditEvent?: (event: CalendarEvent) => void;
}

const today = dayjs().format("YYYY-MM-DD");

export default function Calendar({ events = [], isAdmin = false, onEditEvent }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showEventList, setShowEventList] = useState(false);
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

  const getEventsForDay = (day: number): CalendarEvent[] => {
    const dateStr = currentMonth.date(day).format("YYYY-MM-DD");
    return events.filter((e) => e.date === dateStr);
  };

  const handleDayClick = (day: number) => {
    const dayEvents = getEventsForDay(day);
    const dateStr = currentMonth.date(day).format("YYYY-MM-DD");
    
    if (dayEvents.length === 0) {
      return;
    } else if (dayEvents.length === 1) {
      // Single event - open directly
      setSelectedEvent(dayEvents[0]);
      setIsVisible(true);
      setShowEventList(false);
    } else {
      // Multiple events - show list
      setSelectedDayEvents(dayEvents);
      setSelectedDate(dateStr);
      setShowEventList(true);
      setIsVisible(false);
    }
  };

  const openEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventList(false);
    setIsVisible(true);
  };

  const closeEvent = () => {
    setIsVisible(false);
    setTimeout(() => {
      setSelectedEvent(null);
      setSelectedDayEvents([]);
      setSelectedDate(null);
    }, 200);
  };

  const closeEventList = () => {
    setShowEventList(false);
    setTimeout(() => {
      setSelectedDayEvents([]);
      setSelectedDate(null);
    }, 200);
  };

  const closeAll = () => {
    setIsVisible(false);
    setShowEventList(false);
    setShowSignup(false);
    setSelectedEvent(null);
    setSelectedDayEvents([]);
    setSelectedDate(null);
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
              const dayEvents = day ? getEventsForDay(day) : [];
              const hasEvents = dayEvents.length > 0;
              const eventType = dayEvents[0]?.type;
              const eventCount = dayEvents.length;
              return (
                <div
                  key={`${wi}-${di}`}
                  onClick={() => {
                    if (hasEvents && day) handleDayClick(day);
                  }}
                  className={`group h-16 flex flex-col justify-center items-center rounded-md transition cursor-pointer overflow-hidden
                    ${
                      hasEvents
                        ? eventType === "Workshop"
                          ? "bg-yellow-400/50 text-black hover:bg-yellow-400"
                          : eventType === "Comp"
                          ? "bg-blue-500/50 text-white hover:bg-blue-500"
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
                  {hasEvents && (
                    <div className="flex items-center gap-1 mt-1">
                      <StarIcon className="w-4 h-4 transition-colors text-yellow-400 group-hover:text-black" />
                      {eventCount > 1 && (
                        <span className="text-xs font-semibold text-yellow-600 group-hover:text-black">
                          {eventCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL for event list (multiple events on same day) */}
      {showEventList && selectedDayEvents.length > 0 && (
        <div
          className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-200 
            ${showEventList ? "opacity-100" : "opacity-0"} 
            bg-black/60 backdrop-blur-sm`}
          onClick={closeEventList}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative bg-neutral-900 text-neutral-100 rounded-lg shadow-lg max-w-lg w-full mx-4 border border-neutral-700 transform transition-all duration-200
              ${showEventList ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
          >
            {/* Close button */}
            <button
              className="absolute top-3 right-3 text-neutral-400 hover:text-primary z-10"
              onClick={closeEventList}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <div className="p-6">
              <h3 className="text-2xl font-bold text-primary mb-2">
                Events on {dayjs(selectedDate).format("dddd, MMMM D, YYYY")}
              </h3>
              <p className="text-gray-400 mb-6">
                {selectedDayEvents.length} {selectedDayEvents.length === 1 ? "event" : "events"} scheduled
              </p>

              {/* Event list */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {selectedDayEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => openEvent(event)}
                    className="w-full text-left p-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-primary transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-primary group-hover:text-yellow-400 transition-colors mb-1">
                          {event.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                          {event.start_time && (
                            <span className="flex items-center gap-1">
                              🕐 {new Date(event.start_time).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            📍 {event.location}
                          </span>
                          {event.type && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              event.type === "Workshop"
                                ? "bg-yellow-400/20 text-yellow-400"
                                : event.type === "Comp"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-primary/20 text-primary"
                            }`}>
                              {event.type}
                            </span>
                          )}
                        </div>
                        {event.price && (
                          <p className="text-yellow-400 font-semibold mt-2">
                            ${event.price.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <svg
                          className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL for event details */}
      {selectedEvent && !showSignup && !showEventList && (
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
              {selectedEvent.start_time
                ? ` • ${new Date(selectedEvent.start_time).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : ""}
            </p>
            <p className="text-gray-300 mb-2 italic">
              📍 {selectedEvent.location}
            </p>
            {selectedEvent.price && (
              <p className="text-yellow-400 font-semibold mb-4">
                Price: ${selectedEvent.price.toFixed(2)}
              </p>
            )}
            <p className="text-neutral-200 leading-relaxed mb-6">
              {selectedEvent.description}
            </p>

            {/* Signup button or Closed state */}
            <div className="flex gap-3">
              {dayjs(selectedEvent.date).isBefore(dayjs(), "day") ? (
                <button
                  disabled
                  className="inline-block bg-gray-500 text-gray-200 font-semibold px-5 py-2 rounded-md cursor-not-allowed opacity-70"
                >
                  Closed
                </button>
              ) : selectedEvent.type === "Comp" && (selectedEvent.signupLink || selectedEvent.signup_link) ? (
                <a
                  href={selectedEvent.signupLink || selectedEvent.signup_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-signup inline-block text-center"
                >
                  Sign Up
                </a>
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
              {isAdmin && onEditEvent && (
                <button
                  onClick={() => {
                    setIsVisible(false);
                    onEditEvent(selectedEvent);
                  }}
                  className="px-4 py-2 rounded-md bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Event Signup Modal --- */}
      {selectedEvent && selectedEvent.type !== "Comp" && (
        <EventSignupModal
          event={selectedEvent}
          open={showSignup}
          onClose={closeAll}
        />
      )}
    </>
  );
}
