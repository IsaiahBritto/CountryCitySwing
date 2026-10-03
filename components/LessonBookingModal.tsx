"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useEffect, useState } from "react";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  formatTimeRangeWithTimeZone,
} from "@/lib/utils/dateHelpers";
import { emitCcsSuccessToast, emitCcsWarningToast } from "@/lib/ccsSuccessToastBus";
import LessonModalShell from "@/components/LessonModalShell";

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
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [instructorName, setInstructorName] = useState<string | null>(null);
  const [instructorDisclaimer, setInstructorDisclaimer] = useState<string | null>(null);
  const [disclaimerAcknowledged, setDisclaimerAcknowledged] = useState(false);
  const [instructorLoading, setInstructorLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasDisclaimer = Boolean(instructorDisclaimer?.trim());

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [lessonFocus, setLessonFocus] = useState<"Follow Focused" | "Lead Focused" | "Lead/Follow Focused" | "">("");

  useEffect(() => {
    async function checkAuth() {
      const { data: { user: currentUser } } = await supabaseBrowser.auth.getUser();
      setUser(currentUser ? { id: currentUser.id } : null);

      if (currentUser) {
        const { data: profileData } = await supabaseBrowser
          .from("profiles")
          .select("first_name, last_name, email, phone_number")
          .eq("id", currentUser.id)
          .single();

        setFirstName(profileData?.first_name || currentUser.user_metadata?.first_name || "");
        setLastName(profileData?.last_name || currentUser.user_metadata?.last_name || "");
        setEmail(profileData?.email || currentUser.email || "");
        setPhoneNumber(profileData?.phone_number || "");
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    async function fetchInstructor() {
      setInstructorLoading(true);
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
      setInstructorLoading(false);
    }
    fetchInstructor();
  }, [slot.instructor_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const slotStartTime = new Date(slot.start);
    if (slotStartTime < new Date()) {
      alert("❌ Cannot book a lesson that has already started.");
      return;
    }

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
    if (!phoneNumber.trim()) {
      alert("Phone number is required");
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

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const createRes = await fetch("/api/private-lesson-bookings", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slotId: slot.id,
        instructorId: slot.instructor_id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        lessonFocus,
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}));
      alert("❌ Booking failed: " + (errBody.error || createRes.statusText));
      setSaving(false);
      return;
    }

    const { bookingId } = (await createRes.json()) as { bookingId?: string };

    let studentEmailFailed = false;
    try {
      const tz = slot.time_zone || DEFAULT_TIME_ZONE;
      const { startTime, tzAbbrev } = formatTimeRangeWithTimeZone(slot.start, slot.end, tz);
      const lessonTime = `${startTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;
      const lessonDuration =
        slot.duration_minutes ||
        Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000);

      const studentEmailRes = await fetch("/api/lesson-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          instructorId: slot.instructor_id,
          studentEmail: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          lessonDate: slot.start,
          lessonTime,
          lessonDuration,
          lessonFocus,
          lessonPrice: slot.price,
          lessonLocation: slot.location?.trim() || null,
        }),
      });
      if (!studentEmailRes.ok) {
        studentEmailFailed = true;
        console.error(
          "Student lesson confirmation email failed:",
          studentEmailRes.status,
          await studentEmailRes.text()
        );
      }

      const instructorEmailRes = await fetch("/api/lesson-booking-instructor-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructorId: slot.instructor_id,
          studentFirstName: firstName.trim(),
          studentLastName: lastName.trim(),
          studentEmail: email.trim(),
          studentPhone: phoneNumber.trim(),
          lessonDate: slot.start,
          lessonTime,
          lessonDuration,
          lessonFocus,
          lessonPrice: slot.price,
          lessonLocation: slot.location?.trim() || null,
        }),
      });
      if (!instructorEmailRes.ok) {
        console.error(
          "Instructor lesson notification email failed:",
          instructorEmailRes.status,
          await instructorEmailRes.text()
        );
      }
    } catch (emailError) {
      studentEmailFailed = true;
      console.error("Failed to send confirmation email:", emailError);
    }

    if (studentEmailFailed) {
      emitCcsWarningToast(
        "Your lesson was booked, but the confirmation email could not be sent. Please contact your instructor or check spam."
      );
    } else {
      emitCcsSuccessToast("Private lesson booked successfully.");
    }
    setTimeout(() => onClose(), 400);

    setSaving(false);
  };

  if (instructorLoading) {
    return (
      <LessonModalShell title="Book Private Lesson" onClose={onClose} maxWidthClassName="max-w-md">
        <p className="text-center text-gray-300">Loading...</p>
      </LessonModalShell>
    );
  }

  return (
    <LessonModalShell
      title="Book Private Lesson"
      onClose={onClose}
      maxWidthClassName="max-w-md"
      footer={
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-red-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="lesson-booking-form"
            disabled={saving || (hasDisclaimer && !disclaimerAcknowledged)}
            className="btn-signup rounded-md px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Booking..." : "Confirm Booking"}
          </button>
        </div>
      }
    >
        <div className="mb-4 text-center text-sm text-gray-300">
          {instructorName && (
            <p className="mb-1 text-yellow-400 font-semibold">
              {instructorName}
            </p>
          )}
          {user && (
            <p className="mb-2 text-xs text-gray-400">
              Signed in — this booking will be linked to your account.
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

        <form id="lesson-booking-form" onSubmit={handleSubmit} className="space-y-4">
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
              Phone Number <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-yellow-400 focus:outline-none"
              placeholder="(555) 123-4567"
            />
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
                  onChange={(e) => setLessonFocus(e.target.value as typeof lessonFocus)}
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
                  onChange={(e) => setLessonFocus(e.target.value as typeof lessonFocus)}
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
                  onChange={(e) => setLessonFocus(e.target.value as typeof lessonFocus)}
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

        </form>
    </LessonModalShell>
  );
}
