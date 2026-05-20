"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  formatTimeRangeWithTimeZone,
} from "@/lib/utils/dateHelpers";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";

interface LessonBookingModalProps {
  slot: {
    id: string;
    instructor_id: string;
    start: string;        // ISO string
    end: string;          // ISO string
    time_zone?: string | null;
    is_booked?: boolean;
    duration_minutes?: number;
    price?: number | null;
    location?: string | null;
  };
  onClose: () => void;
}

export default function LessonBookingModal({ slot, onClose }: LessonBookingModalProps) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [instructorName, setInstructorName] = useState<string | null>(null);
  const [instructorDisclaimer, setInstructorDisclaimer] = useState<string | null>(null);
  const [disclaimerAcknowledged, setDisclaimerAcknowledged] = useState(false);
  const [slotPrice, setSlotPrice] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const hasDisclaimer = Boolean(instructorDisclaimer?.trim());
  
  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [lessonFocus, setLessonFocus] = useState<"Follow Focused" | "Lead Focused" | "Lead/Follow Focused" | "">("");

  // Check authentication and fetch user profile
  useEffect(() => {
    async function checkAuth() {
      const { data: { user: currentUser } } = await supabaseBrowser.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        // Fetch user profile
        const { data: profileData } = await supabaseBrowser
          .from("profiles")
          .select("first_name, last_name, email, phone_number")
          .eq("id", currentUser.id)
          .single();
        setProfile(profileData);
        
        // Pre-fill form fields
        setFirstName(profileData?.first_name || currentUser.user_metadata?.first_name || "");
        setLastName(profileData?.last_name || currentUser.user_metadata?.last_name || "");
        setEmail(profileData?.email || currentUser.email || "");
        setPhoneNumber(profileData?.phone_number || "");
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  // Fetch instructor name and optional booking disclaimer
  useEffect(() => {
    async function fetchInstructor() {
      const { data } = await supabaseBrowser
        .from("profiles")
        .select("first_name, last_name, private_lesson_disclaimer")
        .eq("id", slot.instructor_id)
        .single();
      if (data) {
        setInstructorName(`${data.first_name} ${data.last_name}`);
        const disclaimer = data.private_lesson_disclaimer?.trim() || null;
        setInstructorDisclaimer(disclaimer);
        setDisclaimerAcknowledged(false);
      }
    }
    fetchInstructor();
  }, [slot.instructor_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please sign in to book a lesson");
      return;
    }

    // Check if slot is in the past
    const slotStartTime = new Date(slot.start);
    if (slotStartTime < new Date()) {
      alert("❌ Cannot book a lesson that has already started.");
      return;
    }

    // Validate required fields
    if (!firstName.trim()) {
      alert("First name is required");
      return;
    }
    if (!lastName.trim()) {
      alert("Last name is required");
      return;
    }
    if (!email.trim()) {
      alert("Email is required");
      return;
    }
    if (!lessonFocus) {
      alert("Please select a lesson focus");
      return;
    }
    if (hasDisclaimer && !disclaimerAcknowledged) {
      alert("Please read and acknowledge the booking disclaimer before confirming.");
      return;
    }

    setSaving(true);

    // Combine first and last name for student_name (backward compatibility)
    const studentName = `${firstName.trim()} ${lastName.trim()}`.trim();

    // Try to insert with all new fields first
    let bookingData: any = {
      slot_id: slot.id,
      instructor_id: slot.instructor_id,
      student_name: studentName,
      student_email: email.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone_number: phoneNumber.trim() || null,
      lesson_focus: lessonFocus,
      user_id: user.id,
    };

    let { error } = await supabaseBrowser.from("lesson_bookings").insert(bookingData);

    // If new columns don't exist, try with just basic fields
    if (error && (error.message.includes("user_id") || error.message.includes("first_name") || error.message.includes("lesson_focus"))) {
      bookingData = {
        slot_id: slot.id,
        instructor_id: slot.instructor_id,
        student_name: studentName,
        student_email: email.trim(),
      };
      
      // Try to add optional fields if they exist
      const retryResult = await supabaseBrowser.from("lesson_bookings").insert(bookingData);
      error = retryResult.error;
      
      if (error) {
        // Last resort: try with just required fields
        bookingData = {
          slot_id: slot.id,
          instructor_id: slot.instructor_id,
          student_name: studentName,
          student_email: email.trim(),
        };
        const finalResult = await supabaseBrowser.from("lesson_bookings").insert(bookingData);
        error = finalResult.error;
      }
    }

    if (!error) {
      // Mark the slot as booked
      await supabaseBrowser
        .from("lesson_slots")
        .update({ is_booked: true })
        .eq("id", slot.id);

      // Send confirmation emails
      try {
        const tz = slot.time_zone || DEFAULT_TIME_ZONE;
        const { startTime, tzAbbrev } = formatTimeRangeWithTimeZone(slot.start, slot.end, tz);
        const lessonTime = `${startTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;
        const lessonDuration = slot.duration_minutes || Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000);
        
        // Send email to student
        await fetch("/api/lesson-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentEmail: email.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            instructorName: instructorName || "Your Instructor",
            lessonDate: slot.start,
            lessonTime,
            lessonDuration,
            lessonFocus,
            lessonPrice: slot.price,
            lessonLocation: slot.location?.trim() || null,
          }),
        });

        // Send email to instructor
        await fetch("/api/lesson-booking-instructor-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instructorId: slot.instructor_id,
            studentFirstName: firstName.trim(),
            studentLastName: lastName.trim(),
            studentEmail: email.trim(),
            studentPhone: phoneNumber.trim() || null,
            lessonDate: slot.start,
            lessonTime,
            lessonDuration,
            lessonFocus,
            lessonPrice: slot.price,
            lessonLocation: slot.location?.trim() || null,
          }),
        });
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        // Don't fail the booking if email fails
      }

      emitCcsSuccessToast("Private lesson booked successfully.");
      setTimeout(() => onClose(), 400); // trigger calendar refresh + close modal
    } else {
      alert("❌ Booking failed: " + error.message);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
        <div className="bg-neutral-900 text-white rounded-lg p-6 w-[90%] max-w-sm shadow-lg border border-yellow-400/30">
          <p className="text-center">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
        <div className="bg-neutral-900 text-white rounded-lg p-6 w-[90%] max-w-sm shadow-lg border border-yellow-400/30">
          <h3 className="text-xl font-semibold text-primary mb-3 text-center">
            Sign In Required
          </h3>
          <p className="text-gray-300 text-sm mb-4 text-center">
            You must be signed in to book a private lesson.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
            <Link
              href="/auth"
              className="btn-signup px-4 py-2 rounded-md text-center"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
      <div className="bg-neutral-900 text-white rounded-lg p-6 w-[90%] max-w-md shadow-lg border border-yellow-400/30 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-primary mb-3 text-center">
          Book Private Lesson
        </h3>

        <div className="text-gray-300 text-sm mb-4 text-center">
          {instructorName && (
            <p className="mb-1 text-yellow-400 font-semibold">
              {instructorName}
            </p>
          )}
          {(() => {
            const tz = slot.time_zone || DEFAULT_TIME_ZONE;
            const dateStr = formatDateInTimeZone(slot.start, tz, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            const { startTime, endTime, tzAbbrev } = formatTimeRangeWithTimeZone(slot.start, slot.end, tz);
            return (
              <>
                <p>{dateStr}</p>
                <p>
                  {startTime} – {endTime}{tzAbbrev ? ` ${tzAbbrev}` : ""}
                </p>
              </>
            );
          })()}
          <p className="text-gray-400 mt-1">
            Duration: {slot.duration_minutes || Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000)} minutes
          </p>
          {slot.price && (
            <p className="text-yellow-400 font-semibold mt-2">
              Price: ${slot.price.toFixed(2)}
            </p>
          )}
          {slot.location?.trim() && (
            <p className="text-gray-300 mt-2">
              <span className="text-yellow-400/90 font-medium">Location: </span>
              {slot.location.trim()}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                First Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-yellow-400 focus:outline-none"
                placeholder="First Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Last Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-yellow-400 focus:outline-none"
                placeholder="Last Name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-yellow-400 focus:outline-none"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-yellow-400 focus:outline-none"
              placeholder="(555) 123-4567"
            />
            <p className="text-xs text-gray-400 mt-1">Optional but encouraged</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Lesson Focus <span className="text-red-400">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="lessonFocus"
                  value="Follow Focused"
                  checked={lessonFocus === "Follow Focused"}
                  onChange={(e) => setLessonFocus(e.target.value as any)}
                  required
                  className="mr-2 accent-yellow-400"
                />
                <span className="text-gray-300">Follow Focused</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="lessonFocus"
                  value="Lead Focused"
                  checked={lessonFocus === "Lead Focused"}
                  onChange={(e) => setLessonFocus(e.target.value as any)}
                  required
                  className="mr-2 accent-yellow-400"
                />
                <span className="text-gray-300">Lead Focused</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="lessonFocus"
                  value="Lead/Follow Focused"
                  checked={lessonFocus === "Lead/Follow Focused"}
                  onChange={(e) => setLessonFocus(e.target.value as any)}
                  required
                  className="mr-2 accent-yellow-400"
                />
                <span className="text-gray-300">Lead/Follow Focused</span>
              </label>
            </div>
          </div>

          {hasDisclaimer && (
            <div className="rounded-lg border border-yellow-400/50 bg-gradient-to-b from-yellow-400/10 to-transparent p-4 shadow-[inset_0_1px_0_rgba(242,201,76,0.15)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-400 mb-2">
                Booking disclaimer
              </p>
              <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1">
                {instructorDisclaimer}
              </div>
              <label className="flex items-start gap-3 mt-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={disclaimerAcknowledged}
                  onChange={(e) => setDisclaimerAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-yellow-400"
                />
                <span className="text-sm text-gray-300 group-hover:text-gray-200">
                  I have read and understand the disclaimer above.{" "}
                  <span className="text-red-400">*</span>
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-center gap-4 items-center pt-4 border-t border-neutral-700">
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (hasDisclaimer && !disclaimerAcknowledged)}
              className="btn-signup px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Booking..." : "Confirm Booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
