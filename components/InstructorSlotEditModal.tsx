"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useEffect, useState, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import dayjs from "dayjs";
import { DEFAULT_TIME_ZONE, formatTimeRangeWithTimeZone } from "@/lib/utils/dateHelpers";

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

  // Form state
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timeZone, setTimeZone] = useState(slot.time_zone || DEFAULT_TIME_ZONE);
  const [duration, setDuration] = useState(slot.duration_minutes || 60);
  const [price, setPrice] = useState<number | null>(slot.price || null);

  const fetchBookingInfo = useCallback(async () => {
    setLoading(true);
    // Try to fetch with all new fields first
    let { data, error } = await supabaseBrowser
      .from("lesson_bookings")
      .select("id, student_name, student_email, first_name, last_name, email, phone_number, lesson_focus")
      .eq("slot_id", slot.id)
      .single();

    // If new columns don't exist, fall back to basic fields
    if (error && (error.message.includes("first_name") || error.message.includes("lesson_focus"))) {
      const fallbackResult = await supabaseBrowser
        .from("lesson_bookings")
        .select("id, student_name, student_email")
        .eq("slot_id", slot.id)
        .single();
      
      if (!fallbackResult.error && fallbackResult.data) {
        // Map fallback data to match the expected interface
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
    // Initialize form with current slot data
    const startDate = dayjs(slot.start);
    setDate(startDate.format("YYYY-MM-DD"));
    setTime(startDate.format("HH:mm"));
    setTimeZone(slot.time_zone || DEFAULT_TIME_ZONE);
    setDuration(slot.duration_minutes || 60);
    setPrice(slot.price || null);

    // Fetch booking info if slot is booked
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
    const start = new Date(`${date}T${time}`);
    const end = new Date(start.getTime() + duration * 60000);

    const updateData: any = {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      time_zone: timeZone,
    };
    
    if (price !== null && price !== undefined) {
      updateData.price = price;
    }

    // Store old slot data for comparison
    const oldStart = new Date(slot.start);
    const oldDuration = slot.duration_minutes || 60;
    const oldPrice = slot.price;

    const { error } = await supabaseBrowser
      .from("lesson_slots")
      .update(updateData)
      .eq("id", slot.id);

    if (error) {
      setSaving(false);
      alert("Error updating slot: " + error.message);
      return;
    }

    // If slot is booked, send notification email to student
    if (slot.is_booked && bookingInfo) {
      // Check if anything actually changed
      const startChanged = oldStart.getTime() !== start.getTime();
      const durationChanged = oldDuration !== duration;
      const priceChanged = oldPrice !== price;

      if (startChanged || durationChanged || priceChanged) {
        try {
          // Fetch instructor name
          const { data: instructorProfile } = await supabaseBrowser
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", slot.instructor_id)
            .single();

          const instructorName = instructorProfile
            ? `${instructorProfile.first_name} ${instructorProfile.last_name}`
            : "Your Instructor";

          const lessonDate = start.toISOString();
          const { startTime, tzAbbrev } = formatTimeRangeWithTimeZone(lessonDate, end.toISOString(), timeZone);
          const lessonTime = `${startTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;

          const studentFirstName = bookingInfo.first_name || bookingInfo.student_name?.split(" ")[0] || "";
          const studentLastName = bookingInfo.last_name || bookingInfo.student_name?.split(" ").slice(1).join(" ") || "";
          const studentEmail = bookingInfo.email || bookingInfo.student_email;

          if (studentEmail) {
            await fetch("/api/lesson-update-student-notification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                studentEmail,
                studentFirstName,
                studentLastName,
                instructorName,
                lessonDate,
                lessonTime,
                lessonDuration: duration,
                lessonFocus: bookingInfo.lesson_focus || null,
                lessonPrice: price,
              }),
            });
          }
        } catch (emailError) {
          console.error("Failed to send student notification email:", emailError);
          // Don't fail the update if email fails
        }
      }
    }

    setSaving(false);
    alert("Slot updated successfully!");
    onUpdate();
    onClose();
  }

  async function handleUnbook() {
    if (!confirm("Remove the booking from this slot? The student will be unassigned.")) {
      return;
    }

    setDeleting(true);

    // Delete the booking
    const { error: bookingError } = await supabaseBrowser
      .from("lesson_bookings")
      .delete()
      .eq("slot_id", slot.id);

    if (bookingError) {
      alert("Error removing booking: " + bookingError.message);
      setDeleting(false);
      return;
    }

    // Mark slot as not booked
    const { error: slotError } = await supabaseBrowser
      .from("lesson_slots")
      .update({ is_booked: false })
      .eq("id", slot.id);

    setDeleting(false);

    if (slotError) {
      alert("Error updating slot: " + slotError.message);
    } else {
      alert("Booking removed successfully!");
      onUpdate();
      onClose();
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this slot permanently? This cannot be undone.")) {
      return;
    }

    setDeleting(true);

    // If booked, delete the booking first
    if (slot.is_booked) {
      await supabaseBrowser
        .from("lesson_bookings")
        .delete()
        .eq("slot_id", slot.id);
    }

    // Delete the slot
    const { error } = await supabaseBrowser
      .from("lesson_slots")
      .delete()
      .eq("id", slot.id);

    setDeleting(false);

    if (error) {
      alert("Error deleting slot: " + error.message);
    } else {
      alert("Slot deleted successfully!");
      onUpdate();
      onClose();
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
        <div className="bg-neutral-900 text-white rounded-lg p-6 w-[90%] max-w-md shadow-lg border border-yellow-400/30">
          <p className="text-center">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 text-white rounded-lg p-6 w-[90%] max-w-md shadow-lg border border-yellow-400/30"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-primary">
            {slot.is_booked ? "Edit Booked Slot" : "Edit Available Slot"}
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-primary"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Booking Information (if booked) */}
        {slot.is_booked && bookingInfo && (
          <div className="mb-6 p-4 bg-neutral-800 rounded-lg border border-yellow-400/30">
            <h4 className="text-lg font-semibold text-yellow-400 mb-3">
              Booking Information
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">Name:</span>{" "}
                <span className="text-white font-medium">
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
                  <span className="text-white font-medium text-yellow-400">
                    {bookingInfo.lesson_focus}
                  </span>
                </div>
              )}
              {slot.price && (
                <div>
                  <span className="text-gray-400">Price:</span>{" "}
                  <span className="text-white font-medium text-yellow-400">
                    ${slot.price.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={handleUnbook}
              disabled={deleting}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {deleting ? "Removing..." : "Remove Booking"}
            </button>
          </div>
        )}

        {/* Edit Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Time zone
            </label>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            >
              <option value="America/Chicago">Central Time</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Duration (minutes)
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            >
              <option value={30}>30</option>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Price ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price === null ? "" : price}
              onChange={(e) => setPrice(e.target.value === "" ? null : parseFloat(e.target.value))}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black rounded-md font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete Slot"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
