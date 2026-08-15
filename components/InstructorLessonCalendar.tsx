"use client";

import { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isoWeek from "dayjs/plugin/isoWeek";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import LessonBookingModal from "@/components/LessonBookingModal";
import InstructorSlotEditModal from "@/components/InstructorSlotEditModal";
import CancelBookingModal from "@/components/CancelBookingModal";
import LessonModalShell from "@/components/LessonModalShell";
import StudentConfirmationEmailFailedBadge from "@/components/StudentConfirmationEmailFailedBadge";
import {
  DEFAULT_TIME_ZONE,
  formatTimeInTimeZone,
  getDateStringInTimeZone,
  getTimeZoneAbbreviation,
} from "@/lib/utils/dateHelpers";

dayjs.extend(weekday);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

interface LessonSlot {
  id: string;
  start: string;
  end: string;
  is_booked: boolean;
  instructor_id: string;
  duration_minutes: number;
  price?: number | null;
  location?: string | null;
  booking_user_id?: string | null;
  booking_id?: string | null;
  time_zone?: string | null;
  student_confirmation_email_sent?: boolean;
}

export default function InstructorLessonCalendar({
  instructorId,
  isInstructorView = false,
}: {
  instructorId: string;
  isInstructorView?: boolean;
}) {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // --- Get current user ---
  useEffect(() => {
    async function getCurrentUser() {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      setCurrentUserId(user?.id || null);
    }
    getCurrentUser();
  }, []);

  // --- Fetch slots from Supabase ---
  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const rangeStart =
      view === "week"
        ? currentMonth.startOf("week").startOf("day")
        : currentMonth.startOf("month");
    const rangeEnd =
      view === "week"
        ? currentMonth.startOf("week").add(6, "day").endOf("day")
        : currentMonth.endOf("month");

    try {
      // Fetch any slot overlapping the visible range (not only slots fully inside it).
      // The old filter required end_time <= month end, which dropped slots whose end crossed
      // a day/month boundary — especially common for custom durations like 50 minutes.
      const { data: slotsData, error: slotsError } = await supabaseBrowser
        .from("lesson_slots")
        .select("id,start_time,end_time,is_booked,instructor_id,duration_minutes,price,time_zone,location")
        .eq("instructor_id", instructorId)
        .lt("start_time", rangeEnd.toISOString())
        .gt("end_time", rangeStart.toISOString())
        .order("start_time", { ascending: true });

      if (slotsError) {
        console.error("Error fetching slots:", slotsError);
        setSlots([]);
        setLoading(false);
        return;
      }

      if (!slotsData || slotsData.length === 0) {
        setSlots([]);
        setLoading(false);
        return;
      }

      // Now fetch bookings for these slots separately
      const slotIds = slotsData.map((s: any) => s.id);
      let { data: bookingsData, error: bookingsError } = await supabaseBrowser
        .from("lesson_bookings")
        .select("id, user_id, slot_id, student_confirmation_email_sent")
        .in("slot_id", slotIds);

      if (bookingsError?.message?.includes("student_confirmation_email_sent")) {
        const fallback = await supabaseBrowser
          .from("lesson_bookings")
          .select("id, user_id, slot_id")
          .in("slot_id", slotIds);
        bookingsData = (fallback.data || []).map((b: any) => ({
          ...b,
          student_confirmation_email_sent: true,
        }));
      }

      // Create a map of slot_id to booking
      const bookingsMap = new Map();
      if (bookingsData) {
        bookingsData.forEach((booking: any) => {
          bookingsMap.set(booking.slot_id, booking);
        });
      }

      // Combine the data
      const formattedSlots = slotsData.map((d: any) => {
        const booking = bookingsMap.get(d.id);
        
        return {
          id: d.id,
          start: d.start_time || d.start,
          end: d.end_time || d.end,
          is_booked: d.is_booked || false,
          instructor_id: d.instructor_id,
          duration_minutes: d.duration_minutes,
          price: d.price || null,
          location: d.location || null,
          booking_user_id: booking?.user_id || null,
          booking_id: booking?.id || null,
          time_zone: d.time_zone || null,
          student_confirmation_email_sent:
            booking?.student_confirmation_email_sent !== false,
        };
      });

      setSlots(formattedSlots);
    } catch (err) {
      console.error("Unexpected error fetching slots:", err);
    } finally {
      setLoading(false);
    }
  }, [instructorId, currentMonth, view]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // --- Set up realtime subscription for live updates (instructor view only) ---
  // Realtime requires "lesson_slots" and "lesson_bookings" to have replication enabled in Supabase (Database → Replication).
  // If subscription fails, the calendar still works via fetchSlots(); we don't surface errors to the user.
  useEffect(() => {
    if (!isInstructorView) return;

    const channelName = `lesson_slots_changes_${instructorId}`;
    const channel = supabaseBrowser.channel(channelName);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lesson_slots",
          filter: `instructor_id=eq.${instructorId}`,
        },
        () => fetchSlots()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lesson_bookings",
        },
        () => fetchSlots()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Realtime active; live updates will refresh the calendar
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Replication may be disabled for lesson_slots/lesson_bookings in Supabase. Calendar still works via fetch.
          console.warn(
            "[InstructorLessonCalendar] Realtime unavailable for",
            channelName,
            "— calendar will still work; enable replication for lesson_slots and lesson_bookings if you want live updates."
          );
        }
      });

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [instructorId, fetchSlots, isInstructorView]);

  const today = dayjs().format("YYYY-MM-DD");
  const daysInMonth = currentMonth.daysInMonth();
  const firstDayOfMonth = currentMonth.startOf("month").day();
  const startDayIndex = firstDayOfMonth;

  const nextMonth = () => setCurrentMonth(currentMonth.add(1, "month"));
  const prevMonth = () => setCurrentMonth(currentMonth.subtract(1, "month"));
  const nextWeek = () => setCurrentMonth(currentMonth.add(1, "week"));
  const prevWeek = () => setCurrentMonth(currentMonth.subtract(1, "week"));

  // --- Calendar data helpers ---
  const getSlotsForDay = (day: number) => {
    const dateStr = currentMonth.date(day).format("YYYY-MM-DD");
    const daySlots = slots.filter((s) => {
      const tz = s.time_zone || DEFAULT_TIME_ZONE;
      return getDateStringInTimeZone(s.start, tz) === dateStr;
    });
    // Sort by start time (earliest first)
    return daySlots.sort((a, b) => {
      const timeA = new Date(a.start).getTime();
      const timeB = new Date(b.start).getTime();
      return timeA - timeB;
    });
  };

  // Helper to get available (non-booked and non-past) slots for a day
  const getAvailableSlotsForDay = (day: number) => {
    return getSlotsForDay(day).filter((s) => !s.is_booked && !isSlotPast(s));
  };

  const openDayView = (day: number) => {
    setSelectedDate(currentMonth.date(day));
  };

  const closeDayView = () => {
    setSelectedDate(null);
  };

  // --- Week view helpers ---
  const weekStart = currentMonth.startOf("week");
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day"));

  // Helper function to check if a slot is in the past
  const isSlotPast = (slot: LessonSlot) => {
    return dayjs(slot.start).isBefore(dayjs(), "minute");
  };

  // --- Slot handler ---
  function handleSlotClick(slot: LessonSlot) {
    // If this is the instructor's own view, allow editing any slot
    if (isInstructorView) {
      setSelectedSlot(slot);
      return;
    }

    // For public view - don't allow booking past slots
    if (isSlotPast(slot)) {
      return;
    }

    // For public view
    if (slot.is_booked) {
      // If user booked this slot themselves, show cancel modal
      if (currentUserId && slot.booking_user_id === currentUserId) {
        setSelectedSlot(slot);
        setShowCancelModal(true);
      }
      // Otherwise, don't allow clicking on booked slots
      return;
    }

    // Available slot - show booking modal
    setSelectedSlot(slot);
  }

  // Refresh slots after updates (uses the same fetchSlots function)
  const refreshSlots = useCallback(() => {
    fetchSlots();
  }, [fetchSlots]);

  // --- Month grid building ---
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

  if (loading)
    return (
      <p className="text-gray-400 text-center py-10">Loading lesson slots...</p>
    );

  return (
    <>
      {/* --- View toggle with sliding bar --- */}
      <div className="flex justify-center mb-6">
        <div className="relative inline-flex bg-neutral-800 rounded-lg p-1 border border-neutral-700">
          {/* Sliding background bar */}
          <div
            className={`absolute top-1 bottom-1 rounded-md bg-yellow-400 transition-all duration-300 ease-in-out ${
              view === "month" ? "left-1" : "left-1/2"
            }`}
            style={{ width: "calc(50% - 0.125rem)" }}
          />
          
          {/* Toggle buttons */}
          {["month", "week"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v as "month" | "week")}
              className={`relative z-10 px-6 py-2 rounded-md font-semibold text-base transition-colors duration-300 ${
                view === v
                  ? "text-black"
                  : "text-gray-300 hover:text-yellow-400"
              }`}
            >
              {v === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </div>

      {/* --- Month View --- */}
      {view === "month" && (
        <div className="bg-neutral-800 text-neutral-100 rounded-lg p-6 shadow-lg max-w-3xl mx-auto">
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
                const daySlots = day ? getSlotsForDay(day) : [];
                const available = day ? getAvailableSlotsForDay(day).length : 0;
                const booked = daySlots.filter((s) => s.is_booked).length;
                const hasSlots = daySlots.length > 0;

                return (
                  <div
                    key={`${wi}-${di}`}
                    onClick={() => hasSlots && openDayView(day!)}
                    className={`group h-12 sm:h-16 flex flex-col justify-center items-center rounded-md transition cursor-pointer overflow-hidden
                      ${
                        hasSlots
                          ? available > 0
                            ? "bg-yellow-400 text-black hover:bg-yellow-400/50"
                            : "bg-neutral-700 text-gray-300"
                          : "bg-neutral-900 text-gray-500"
                      }
                      ${
                        day &&
                        currentMonth.date(day).format("YYYY-MM-DD") === today
                          ? "ring-2 ring-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]"
                          : ""
                      }`}
                  >
                    {day && (
                      <span className="font-medium text-base">{day}</span>
                    )}
                    {hasSlots && (
                      <span className="text-xs mt-1">
                        {available > 0
                          ? `${available} open`
                          : `${booked} booked`}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* --- Week View --- */}
      {view === "week" && (
        <div className="bg-neutral-800 rounded-lg p-4 shadow-lg max-w-5xl mx-auto text-white">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={prevWeek}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
            >
              ←
            </button>
            <h2 className="text-xl font-semibold text-primary">
              Week of {weekStart.format("MMM D")}
            </h2>
            <button
              onClick={nextWeek}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const daySlots = slots
                .filter((s) => {
                  const tz = s.time_zone || DEFAULT_TIME_ZONE;
                  return getDateStringInTimeZone(s.start, tz) === d.format("YYYY-MM-DD");
                })
                .sort((a, b) => {
                  const timeA = new Date(a.start).getTime();
                  const timeB = new Date(b.start).getTime();
                  return timeA - timeB;
                });
              const isToday = d.format("YYYY-MM-DD") === today;
              return (
                <div
                  key={d.toString()}
                  className={`p-2 bg-neutral-900 rounded text-center ${
                    isToday
                      ? "ring-2 ring-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]"
                      : ""
                  }`}
                >
                  <p className="text-sm text-yellow-400 mb-2">
                    {d.format("ddd D")}
                  </p>
                  {daySlots.length === 0 && (
                    <p className="text-gray-600 text-xs">—</p>
                  )}
                  {daySlots.map((s) => {
                    const isUserBooking = currentUserId && s.booking_user_id === currentUserId;
                    const isPast = isSlotPast(s);
                    const tz = s.time_zone || DEFAULT_TIME_ZONE;
                    const tzAbbrev = getTimeZoneAbbreviation(s.start, tz);
                    const showEmailFailedBadge =
                      isInstructorView &&
                      s.is_booked &&
                      s.student_confirmation_email_sent === false;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSlotClick(s)}
                        disabled={isPast && !isInstructorView}
                        className={`flex w-full items-center gap-1 text-xs text-left mb-1 px-2 py-1 rounded transition-all ${
                          isPast && !isInstructorView
                            ? "bg-neutral-800 text-gray-600 cursor-not-allowed opacity-50"
                            : s.is_booked
                            ? isInstructorView
                              ? "bg-neutral-800 text-gray-300 hover:bg-neutral-700 cursor-pointer"
                              : isUserBooking
                              ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                              : "bg-neutral-800 text-gray-500 cursor-not-allowed"
                            : "bg-yellow-400 text-black hover:shadow-lg hover:shadow-yellow-400/70"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          {formatTimeInTimeZone(s.start, tz)}{tzAbbrev ? ` ${tzAbbrev}` : ""}
                          {isUserBooking && !isInstructorView && " (Yours)"}
                          {isPast && !isInstructorView && !s.is_booked && " (Past)"}
                        </span>
                        {showEmailFailedBadge && (
                          <StudentConfirmationEmailFailedBadge className="h-5 w-5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- Day Modal --- */}
      {selectedDate && (
        <LessonModalShell
          title={selectedDate.format("dddd, MMMM D")}
          onClose={closeDayView}
        >
          <div className="space-y-2">
            {slots
              .filter((s) => {
                const tz = s.time_zone || DEFAULT_TIME_ZONE;
                return (
                  getDateStringInTimeZone(s.start, tz) ===
                  selectedDate.format("YYYY-MM-DD")
                );
              })
              .sort((a, b) => {
                const timeA = new Date(a.start).getTime();
                const timeB = new Date(b.start).getTime();
                return timeA - timeB;
              })
              .map((slot) => {
                const isUserBooking =
                  currentUserId && slot.booking_user_id === currentUserId;
                const isPast = isSlotPast(slot);
                const tz = slot.time_zone || DEFAULT_TIME_ZONE;
                const tzAbbrev = getTimeZoneAbbreviation(slot.start, tz);
                const showEmailFailedBadge =
                  isInstructorView &&
                  slot.is_booked &&
                  slot.student_confirmation_email_sent === false;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    disabled={isPast && !isInstructorView}
                    className={`flex w-full items-center gap-2 rounded px-4 py-2 text-left transition-all ${
                      isPast && !isInstructorView
                        ? "cursor-not-allowed bg-neutral-800 text-gray-600 opacity-50"
                        : slot.is_booked
                          ? isInstructorView
                            ? "cursor-pointer bg-neutral-800 text-gray-300 hover:bg-neutral-700"
                            : isUserBooking
                              ? "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
                              : "cursor-not-allowed bg-neutral-800 text-gray-500"
                          : "bg-yellow-400 text-black hover:shadow-lg hover:shadow-yellow-400/70"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {formatTimeInTimeZone(slot.start, tz)} –{" "}
                        {formatTimeInTimeZone(slot.end, tz)}
                        {tzAbbrev ? ` ${tzAbbrev}` : ""} (
                        {isPast && !isInstructorView && !slot.is_booked
                          ? "Past"
                          : slot.is_booked
                            ? isUserBooking && !isInstructorView
                              ? "Your Booking"
                              : "Booked"
                            : "Available"}
                        )
                      </span>
                      {slot.location && (
                        <span className="mt-0.5 block truncate text-xs opacity-80">
                          {slot.location}
                        </span>
                      )}
                    </span>
                    {showEmailFailedBadge && <StudentConfirmationEmailFailedBadge />}
                  </button>
                );
              })}
          </div>
        </LessonModalShell>
      )}

      {/* --- Booking Modal (for public view, available slots) --- */}
      {selectedSlot && !isInstructorView && !selectedSlot.is_booked && !isSlotPast(selectedSlot) && !showCancelModal && (
        <LessonBookingModal
          slot={selectedSlot}
          onClose={() => {
            setSelectedSlot(null);
            refreshSlots();
          }}
        />
      )}

      {/* --- Cancel Booking Modal (for user's own bookings) --- */}
      {selectedSlot && !isInstructorView && selectedSlot.is_booked && showCancelModal && selectedSlot.booking_id && (
        <CancelBookingModal
          slot={selectedSlot}
          bookingId={selectedSlot.booking_id}
          onClose={() => {
            setSelectedSlot(null);
            setShowCancelModal(false);
          }}
          onCancel={refreshSlots}
        />
      )}

      {/* --- Edit Modal (for instructor view) --- */}
      {selectedSlot && isInstructorView && !showCancelModal && (
        <InstructorSlotEditModal
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onUpdate={refreshSlots}
        />
      )}
    </>
  );
}
