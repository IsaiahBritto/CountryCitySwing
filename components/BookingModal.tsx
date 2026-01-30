"use client";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useState } from "react";

export default function LessonBookingModal({ slot, onClose }: any) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabaseBrowser.from("lesson_bookings").insert({
      slot_id: slot.id,
      instructor_id: slot.instructor_id,
      student_name: name,
      student_email: email,
    });
    if (!error) {
      await supabaseBrowser
        .from("lesson_slots")
        .update({ is_booked: true })
        .eq("id", slot.id);
      alert("Lesson booked successfully!");
      onClose();
    } else {
      alert("Failed to book lesson: " + error.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
      <div className="bg-neutral-900 text-white rounded-lg p-6 w-[90%] max-w-sm shadow-lg">
        <h3 className="text-xl font-semibold text-primary mb-3 text-center">
          Book Lesson
        </h3>
        <p className="text-gray-400 mb-3 text-center">
          {slot.start.toLocaleString()} — {slot.end.toLocaleTimeString()}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
          />
          <input
            type="email"
            placeholder="Your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
          />
          <div className="flex justify-center gap-4 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-red-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-signup px-4 py-2 rounded-md"
            >
              {saving ? "Booking..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
