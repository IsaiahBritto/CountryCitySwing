"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  formatTimeRangeWithTimeZone,
} from "@/lib/utils/dateHelpers";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";
import LessonModalShell from "@/components/LessonModalShell";

interface CancelBookingModalProps {
  slot: {
    id: string;
    start: string;
    end: string;
    time_zone?: string | null;
    price?: number | null;
    instructor_id?: string;
  };
  bookingId: string;
  onClose: () => void;
  onCancel: () => void;
}

export default function CancelBookingModal({
  slot,
  bookingId,
  onClose,
  onCancel,
}: CancelBookingModalProps) {
  const [canceling, setCanceling] = useState(false);

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel this lesson booking?")) {
      return;
    }

    setCanceling(true);

    let bookingInfo: {
      student_name?: string;
      student_email?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
    } | null = null;
    if (slot.instructor_id) {
      try {
        const { data } = await supabaseBrowser
          .from("lesson_bookings")
          .select("student_name, student_email, first_name, last_name, email")
          .eq("id", bookingId)
          .single();
        bookingInfo = data;
      } catch (err) {
        console.error("Error fetching booking info:", err);
      }
    }

    const { error: bookingError } = await supabaseBrowser
      .from("lesson_bookings")
      .delete()
      .eq("id", bookingId);

    if (bookingError) {
      alert("Error canceling booking: " + bookingError.message);
      setCanceling(false);
      return;
    }

    const { error: slotError } = await supabaseBrowser
      .from("lesson_slots")
      .update({ is_booked: false })
      .eq("id", slot.id);

    if (slot.instructor_id && bookingInfo) {
      try {
        const tz = slot.time_zone || DEFAULT_TIME_ZONE;
        const { startTime, tzAbbrev } = formatTimeRangeWithTimeZone(
          slot.start,
          slot.end,
          tz
        );
        const lessonTime = `${startTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;

        const studentName =
          bookingInfo.first_name && bookingInfo.last_name
            ? `${bookingInfo.first_name} ${bookingInfo.last_name}`
            : bookingInfo.student_name || bookingInfo.student_email || "Student";
        const studentEmail = bookingInfo.email || bookingInfo.student_email;

        await fetch("/api/lesson-cancellation-instructor-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instructorId: slot.instructor_id,
            studentName,
            studentEmail,
            lessonDate: slot.start,
            lessonTime,
          }),
        });
      } catch (emailError) {
        console.error("Failed to send instructor notification email:", emailError);
      }
    }

    setCanceling(false);

    if (slotError) {
      alert("Error updating slot: " + slotError.message);
    } else {
      emitCcsSuccessToast("Lesson booking canceled successfully.");
      onCancel();
      setTimeout(() => onClose(), 400);
    }
  }

  return (
    <LessonModalShell
      title="Cancel Lesson Booking"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md bg-neutral-700 px-4 py-2 text-white transition-colors hover:bg-neutral-600"
          >
            Keep Booking
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={canceling}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {canceling ? "Canceling..." : "Cancel Booking"}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-gray-300">
        Are you sure you want to cancel this lesson?
      </p>
      <div className="rounded border border-neutral-700 bg-neutral-800 p-3">
        <p className="mb-1 text-sm text-gray-400">Date & Time:</p>
        {(() => {
          const tz = slot.time_zone || DEFAULT_TIME_ZONE;
          const dateStr = formatDateInTimeZone(slot.start, tz, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          const { startTime, endTime, tzAbbrev } = formatTimeRangeWithTimeZone(
            slot.start,
            slot.end,
            tz
          );
          return (
            <p className="text-white">
              {dateStr} • {startTime} – {endTime}
              {tzAbbrev ? ` ${tzAbbrev}` : ""}
            </p>
          );
        })()}
        {slot.price != null && (
          <>
            <p className="mb-1 mt-2 text-sm text-gray-400">Price:</p>
            <p className="font-semibold text-yellow-400">${slot.price.toFixed(2)}</p>
          </>
        )}
      </div>
    </LessonModalShell>
  );
}
