"use client";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import LessonBookingModal from "./LessonBookingModal";

const locales = { "en-US": require("date-fns/locale/en-US") };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

interface SlotEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  is_booked: boolean;
  instructor_id: string;
  duration_minutes?: number;
}

export default function LessonSlotCalendar({ instructorId }: { instructorId: string }) {
  const [slots, setSlots] = useState<SlotEvent[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotEvent | null>(null);
  const [refreshToggle, setRefreshToggle] = useState(false); // for refetch trigger

  // Fetch slots from Supabase
  useEffect(() => {
    async function fetchSlots() {
      const { data, error } = await supabaseBrowser
        .from("lesson_slots")
        .select("id, instructor_id, start_time, end_time, duration_minutes, is_booked")
        .eq("instructor_id", instructorId)
        .order("start_time", { ascending: true });

      if (!error && data) {
        const mapped: SlotEvent[] = data.map((s: any) => ({
          id: s.id,
          instructor_id: s.instructor_id,
          title: s.is_booked
            ? `Booked (${s.duration_minutes} min)`
            : `Available (${s.duration_minutes} min)`,
          start: new Date(s.start_time),
          end: new Date(s.end_time),
          is_booked: s.is_booked,
          duration_minutes: s.duration_minutes,
        }));
        setSlots(mapped);
      }
    }

    fetchSlots();
  }, [instructorId, refreshToggle]); // refetch on toggle

  // Listen for realtime updates (optional Supabase channel)
  useEffect(() => {
    const channel = supabaseBrowser
      .channel("lesson_slots_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lesson_slots" },
        () => setRefreshToggle((prev) => !prev)
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, []);

  const handleBookingSuccess = () => {
    // Refresh after booking modal completes
    setSelectedSlot(null);
    setRefreshToggle((prev) => !prev);
  };

  // Custom event style (different colors for booked vs available)
  const eventPropGetter = (event: SlotEvent) => {
    if (event.is_booked) {
      return {
        style: {
          backgroundColor: "rgba(128,128,128,0.4)", // greyed out
          border: "1px solid #666",
          color: "#ccc",
          textDecoration: "line-through",
          cursor: "not-allowed",
        },
      };
    }
    return {
      style: {
        backgroundColor: "rgba(242,201,76,0.3)", // gold tint
        border: "1px solid rgba(242,201,76,0.8)",
        color: "white",
        cursor: "pointer",
      },
    };
  };

  return (
    <div className="bg-neutral-900 rounded-lg p-4 shadow-[0_0_25px_rgba(242,201,76,0.25)]">
      <Calendar
        localizer={localizer}
        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        style={{ height: 600 }}
        events={slots}
        eventPropGetter={eventPropGetter}
        onSelectEvent={(event) => {
          if (!event.is_booked) setSelectedSlot(event);
        }}
        messages={{
          month: "Month",
          week: "Week",
          day: "Day",
          today: "Today",
        }}
      />

      {/* Booking Modal */}
      {selectedSlot && (
        <LessonBookingModal
          slot={{
            id: selectedSlot.id,
            instructor_id: selectedSlot.instructor_id,
            start: selectedSlot.start.toISOString(),
            end: selectedSlot.end.toISOString(),
            is_booked: selectedSlot.is_booked,
            duration_minutes: selectedSlot.duration_minutes,
          }}
          onClose={handleBookingSuccess}
        />
      )}
    </div>
  );
}
