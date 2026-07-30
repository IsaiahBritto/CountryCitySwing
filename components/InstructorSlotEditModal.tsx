"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  DEFAULT_TIME_ZONE,
  formatTimeRangeWithTimeZone,
  toDateTimeLocalInTimeZone,
  fromDateTimeLocalInTimeZone,
} from "@/lib/utils/dateHelpers";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";
import LessonDurationSelect from "@/components/LessonDurationSelect";
import LessonModalShell from "@/components/LessonModalShell";

interface BookingInfo {
  id: string;
  student_name: string;
  student_email: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  lesson_focus?: string;
}

interface InstructorSlotEditModalProps {
  slot: {
    id: string;
    instructor_id: string;
    start: string;
    end: string;
    time_zone?: string | null;
    is_booked: boolean;
    duration_minutes: number;
    price?: number | null;
    location?: string | null;
  };
  onClose: () => void;
  onUpdate: () => void;
}

export default function InstructorSlotEditModal({
  slot,
  onClose,
  onUpdate,
}: InstructorSlotEditModalProps) {
  const [bookingInfo, setBookingInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timeZone, setTimeZone] = useState(slot.time_zone || DEFAULT_TIME_ZONE);
  const [duration, setDuration] = useState(slot.duration_minutes || 60);
  const [price, setPrice] = useState<number | null>(slot.price || null);
  const [location, setLocation] = useState(slot.location || "");

  const fetchBookingInfo = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabaseBrowser
      .from("lesson_bookings")
      .select("id, student_name, student_email, first_name, last_name, email, phone_number, lesson_focus")
      .eq("slot_id", slot.id)
      .single();

    if (error && (error.message.includes("first_name") || error.message.includes("lesson_focus"))) {
      const fallbackResult = await supabaseBrowser
        .from("lesson_bookings")
        .select("id, student_name, student_email")
        .eq("slot_id", slot.id)
        .single();

      if (!fallbackResult.error && fallbackResult.data) {
        data = {
          id: fallbackResult.data.id,
          student_name: fallbackResult.data.student_name,
          student_email: fallbackResult.data.student_email,
          first_name: null,
          last_name: null,
          email: null,
          phone_number: null,
          lesson_focus: null,
        };
      }
      error = fallbackResult.error;
    }

    if (!error && data) {
      setBookingInfo(data as BookingInfo);
    }
    setLoading(false);
  }, [slot.id]);

  useEffect(() => {
    const tz = slot.time_zone || DEFAULT_TIME_ZONE;
    const localDateTime = toDateTimeLocalInTimeZone(slot.start, tz);
    const [d, t] = localDateTime.split("T");
    setDate(d || dayjs(slot.start).format("YYYY-MM-DD"));
    setTime(t || dayjs(slot.start).format("HH:mm"));
    setTimeZone(tz);
    setDuration(slot.duration_minutes || 60);
    setPrice(slot.price || null);
    setLocation(slot.location || "");

    if (slot.is_booked) {
      fetchBookingInfo();
    } else {
      setLoading(false);
    }
  }, [slot, fetchBookingInfo]);

  async function handleUpdate() {
    if (!date || !time) {
      alert("Please select a date and time");
      return;
    }

    setSaving(true);
    const startIso = fromDateTimeLocalInTimeZone(`${date}T${time}`, timeZone);
    if (!startIso) {
      setSaving(false);
      alert("Invalid date/time for selected time zone.");
      return;
    }
    const start = new Date(startIso);
    const end = new Date(start.getTime() + duration * 60000);

    const updateData: Record<string, unknown> = {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      time_zone: timeZone,
    };

    if (price !== null && price !== undefined) {
      updateData.price = price;
    }
    updateData.location = location.trim() || null;

    const oldStart = new Date(slot.start);
    const oldDuration = slot.duration_minutes || 60;
    const oldPrice = slot.price;
    const oldLocation = (slot.location || "").trim();

    const { error } = await supabaseBrowser
      .from("lesson_slots")
      .update(updateData)
      .eq("id", slot.id);

    if (error) {
      setSaving(false);
      alert("Error updating slot: " + error.message);
      return;
    }

    if (slot.is_booked && bookingInfo) {
      const startChanged = oldStart.getTime() !== start.getTime();
      const durationChanged = oldDuration !== duration;
      const priceChanged = oldPrice !== price;
      const locationChanged = oldLocation !== location.trim();

      if (startChanged || durationChanged || priceChanged || locationChanged) {
        try {
          const lessonDate = start.toISOString();
          const { startTime, tzAbbrev } = formatTimeRangeWithTimeZone(
            lessonDate,
            end.toISOString(),
            timeZone
          );
          const lessonTime = `${startTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;

          const studentFirstName =
            bookingInfo.first_name || bookingInfo.student_name?.split(" ")[0] || "";
          const studentLastName =
            bookingInfo.last_name ||
            bookingInfo.student_name?.split(" ").slice(1).join(" ") ||
            "";
          const studentEmail = bookingInfo.email || bookingInfo.student_email;

          if (studentEmail) {
            await fetch("/api/lesson-update-student-notification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                instructorId: slot.instructor_id,
                studentEmail,
                studentFirstName,
                studentLastName,
                lessonDate,
                lessonTime,
                lessonDuration: duration,
                lessonFocus: bookingInfo.lesson_focus || null,
                lessonPrice: price,
                lessonLocation: location.trim() || null,
              }),
            });
          }
        } catch (emailError) {
          console.error("Failed to send student notification email:", emailError);
        }
      }
    }

    setSaving(false);
    emitCcsSuccessToast("Lesson slot updated successfully.");
    onUpdate();
    setTimeout(() => onClose(), 300);
  }

  async function handleUnbook() {
    if (!confirm("Remove the booking from this slot? The student will be unassigned.")) {
      return;
    }

    setDeleting(true);

    const { error: bookingError } = await supabaseBrowser
      .from("lesson_bookings")
      .delete()
      .eq("slot_id", slot.id);

    if (bookingError) {
      alert("Error removing booking: " + bookingError.message);
      setDeleting(false);
      return;
    }

    const { error: slotError } = await supabaseBrowser
      .from("lesson_slots")
      .update({ is_booked: false })
      .eq("id", slot.id);

    setDeleting(false);

    if (slotError) {
      alert("Error updating slot: " + slotError.message);
    } else {
      emitCcsSuccessToast("Booking removed successfully.");
      onUpdate();
      setTimeout(() => onClose(), 300);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this slot permanently? This cannot be undone.")) {
      return;
    }

    setDeleting(true);

    if (slot.is_booked) {
      await supabaseBrowser.from("lesson_bookings").delete().eq("slot_id", slot.id);
    }

    const { error } = await supabaseBrowser
      .from("lesson_slots")
      .delete()
      .eq("id", slot.id);

    setDeleting(false);

    if (error) {
      alert("Error deleting slot: " + error.message);
    } else {
      emitCcsSuccessToast("Slot deleted successfully.");
      onUpdate();
      setTimeout(() => onClose(), 300);
    }
  }

  const title = slot.is_booked ? "Edit Booked Slot" : "Edit Available Slot";

  if (loading) {
    return (
      <LessonModalShell title={title} onClose={onClose}>
        <p className="text-center text-gray-300">Loading...</p>
      </LessonModalShell>
    );
  }

  return (
    <LessonModalShell
      title={title}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={saving}
            className="flex-1 rounded-md bg-yellow-400 px-4 py-2 font-semibold text-black transition-colors hover:bg-yellow-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Slot"}
          </button>
        </div>
      }
    >
      {slot.is_booked && bookingInfo && (
        <div className="mb-6 rounded-lg border border-yellow-400/30 bg-neutral-800 p-4">
          <h4 className="mb-3 text-lg font-semibold text-yellow-400">
            Booking Information
          </h4>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Name:</span>{" "}
              <span className="font-medium text-white">
                {bookingInfo.first_name && bookingInfo.last_name
                  ? `${bookingInfo.first_name} ${bookingInfo.last_name}`
                  : bookingInfo.student_name || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Email:</span>{" "}
              <span className="text-white">
                {bookingInfo.email || bookingInfo.student_email || "N/A"}
              </span>
            </div>
            {bookingInfo.phone_number && (
              <div>
                <span className="text-gray-400">Phone:</span>{" "}
                <span className="text-white">{bookingInfo.phone_number}</span>
              </div>
            )}
            {bookingInfo.lesson_focus && (
              <div>
                <span className="text-gray-400">Lesson Focus:</span>{" "}
                <span className="font-medium text-yellow-400">
                  {bookingInfo.lesson_focus}
                </span>
              </div>
            )}
            {slot.price != null && (
              <div>
                <span className="text-gray-400">Price:</span>{" "}
                <span className="font-medium text-yellow-400">
                  ${slot.price.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleUnbook}
            disabled={deleting}
            className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Removing..." : "Remove Booking"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Time zone
          </label>
          <select
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          >
            <option value="America/Chicago">Central Time</option>
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Denver">Mountain Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Duration (minutes)
          </label>
          <LessonDurationSelect
            value={duration}
            onChange={setDuration}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Price ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price === null ? "" : price}
            onChange={(e) =>
              setPrice(e.target.value === "" ? null : parseFloat(e.target.value))
            }
            placeholder="Optional"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional — studio, address, or link"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          />
        </div>
      </div>
    </LessonModalShell>
  );
}
