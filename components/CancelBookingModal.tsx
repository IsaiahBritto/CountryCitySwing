"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { XMarkIcon } from "@heroicons/react/24/solid";

interface CancelBookingModalProps {
  slot: {
    id: string;
    start: string;
    end: string;
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

    // Delete the booking
    const { error: bookingError } = await supabaseBrowser
      .from("lesson_bookings")
      .delete()
      .eq("id", bookingId);

    if (bookingError) {
      alert("Error canceling booking: " + bookingError.message);
      setCanceling(false);
      return;
    }

    // Mark slot as not booked
    const { error: slotError } = await supabaseBrowser
      .from("lesson_slots")
      .update({ is_booked: false })
      .eq("id", slot.id);

    setCanceling(false);

    if (slotError) {
      alert("Error updating slot: " + slotError.message);
    } else {
      alert("✅ Lesson booking canceled successfully!");
      onCancel();
      onClose();
    }
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
            Cancel Lesson Booking
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-primary"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-300 mb-2">
            Are you sure you want to cancel this lesson?
          </p>
          <div className="p-3 bg-neutral-800 rounded border border-neutral-700">
            <p className="text-sm text-gray-400 mb-1">Date & Time:</p>
            <p className="text-white">
              {new Date(slot.start).toLocaleDateString()} at{" "}
              {new Date(slot.start).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-md transition-colors"
          >
            Keep Booking
          </button>
          <button
            onClick={handleCancel}
            disabled={canceling}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50"
          >
            {canceling ? "Canceling..." : "Cancel Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
