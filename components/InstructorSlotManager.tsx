"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface LessonSlot {
  id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_booked: boolean;
  student_name?: string;
  student_email?: string;
}

export default function InstructorSlotManager({
  instructorId,
}: {
  instructorId: string;
}) {
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]); // 0 = Sunday, 6 = Saturday
  const [numberOfWeeks, setNumberOfWeeks] = useState(1);

  useEffect(() => {
    fetchSlots();
  }, []);

  async function fetchSlots() {
    const { data, error } = await supabaseBrowser
      .from("lesson_slots")
      .select(
        `id, start_time, end_time, duration_minutes, is_booked,
         lesson_bookings (student_name, student_email)`
      )
      .eq("instructor_id", instructorId)
      .order("start_time", { ascending: true });

    if (!error && data) {
      const formatted = data.map((s: any) => ({
        ...s,
        student_name: s.lesson_bookings?.[0]?.student_name,
        student_email: s.lesson_bookings?.[0]?.student_email,
      }));
      setSlots(formatted);
    }
  }

  // Generate all slot dates based on selected days and weeks
  function generateSlotDates(baseDate: Date, days: number[], weeks: number): Date[] {
    const dates: Date[] = [];
    const baseDayOfWeek = baseDate.getDay(); // 0 = Sunday, 6 = Saturday
    
    // If no days selected, just use the base date
    if (days.length === 0) {
      dates.push(baseDate);
      return dates;
    }

    // Generate dates for each selected day across all weeks
    for (let week = 0; week < weeks; week++) {
      for (const dayOfWeek of days) {
        // Calculate days to add: difference between target day and base day
        let daysToAdd = dayOfWeek - baseDayOfWeek;
        // Add weeks
        daysToAdd += week * 7;
        
        const slotDate = new Date(baseDate);
        slotDate.setDate(baseDate.getDate() + daysToAdd);
        dates.push(slotDate);
      }
    }

    // Sort dates chronologically
    return dates.sort((a, b) => a.getTime() - b.getTime());
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      alert("Please select a date and time");
      return;
    }

    // If days are selected, require number of weeks
    if (selectedDays.length > 0 && numberOfWeeks < 1) {
      alert("Please enter the number of weeks (at least 1)");
      return;
    }

    setLoading(true);

    // Create base date/time
    const baseDate = new Date(`${selectedDate}T${selectedTime}`);
    const timeString = selectedTime; // Keep time string for reuse

    // Generate all slot dates
    const slotDates = selectedDays.length > 0 
      ? generateSlotDates(baseDate, selectedDays, numberOfWeeks)
      : [baseDate]; // If no days selected, just use the base date

    // Fetch fresh slots from database to check for overlaps
    const { data: allSlots, error: fetchError } = await supabaseBrowser
      .from("lesson_slots")
      .select("id, start_time, end_time")
      .eq("instructor_id", instructorId);

    if (fetchError) {
      alert("Error checking for overlaps: " + fetchError.message);
      setLoading(false);
      return;
    }

    // Generate all slots to insert
    const slotsToInsert: Array<{ start: Date; end: Date; date: Date }> = [];
    const overlappingSlots: Array<{ date: Date; existingSlot: any }> = [];

    for (const slotDate of slotDates) {
      // Create start time by combining the date with the selected time
      const year = slotDate.getFullYear();
      const month = String(slotDate.getMonth() + 1).padStart(2, '0');
      const day = String(slotDate.getDate()).padStart(2, '0');
      const start = new Date(`${year}-${month}-${day}T${timeString}`);
      const end = new Date(start.getTime() + duration * 60000);

      // Check for overlaps
      const overlappingSlot = allSlots?.find((existingSlot: any) => {
        const existingStart = new Date(existingSlot.start_time);
        const existingEnd = new Date(existingSlot.end_time);
        return start < existingEnd && end > existingStart;
      });

      if (overlappingSlot) {
        overlappingSlots.push({ date: slotDate, existingSlot: overlappingSlot });
      } else {
        slotsToInsert.push({ start, end, date: slotDate });
      }
    }

    // Report overlapping slots if any
    if (overlappingSlots.length > 0) {
      const overlapMessages = overlappingSlots.map(({ date, existingSlot }) => {
        const existingStart = new Date(existingSlot.start_time);
        const overlapDate = date.toLocaleDateString();
        const overlapTime = existingStart.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${overlapDate} (overlaps with ${overlapTime})`;
      }).join('\n');

      if (slotsToInsert.length === 0) {
        alert(
          `❌ All time slots overlap with existing slots!\n\n` +
          `Overlapping dates:\n${overlapMessages}\n\n` +
          `Please choose different times or dates.`
        );
        setLoading(false);
        return;
      }
    }

    // Insert all valid slots
    const slotsToAdd = slotsToInsert.map(({ start, end }) => {
      const slotData: any = {
        instructor_id: instructorId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: duration,
      };
      if (price !== null && price !== undefined) {
        slotData.price = price;
      }
      return slotData;
    });

    const results: Array<{ success: boolean; date: Date; error?: string }> = [];

    // Insert slots one by one to track individual failures
    for (let i = 0; i < slotsToAdd.length; i++) {
      const { error } = await supabaseBrowser
        .from("lesson_slots")
        .insert(slotsToAdd[i]);
      
      results.push({
        success: !error,
        date: slotsToInsert[i].date,
        error: error?.message,
      });
    }

    setLoading(false);

    // Report results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    let message = `✅ Successfully added ${successful.length} slot(s)!\n`;
    
    if (failed.length > 0) {
      const failedDates = failed.map(f => f.date.toLocaleDateString()).join(', ');
      message += `\n❌ Failed to add ${failed.length} slot(s):\n${failedDates}`;
      if (failed[0].error) {
        message += `\n\nError: ${failed[0].error}`;
      }
    }

    if (overlappingSlots.length > 0 && slotsToInsert.length > 0) {
      const overlapDates = overlappingSlots.map(os => os.date.toLocaleDateString()).join(', ');
      message += `\n\n⚠️ Skipped ${overlappingSlots.length} overlapping slot(s):\n${overlapDates}`;
    }

    alert(message);

    // Reset form if all slots were added successfully
    if (failed.length === 0 && overlappingSlots.length === 0) {
      setSelectedDate("");
      setSelectedTime("");
      setPrice(null);
      setSelectedDays([]);
      setNumberOfWeeks(1);
    }

    fetchSlots();
  }

  async function deleteSlot(id: string) {
    if (!confirm("Delete this slot?")) return;
    const { error } = await supabaseBrowser
      .from("lesson_slots")
      .delete()
      .eq("id", id);
    if (error) alert("Error deleting slot.");
    else fetchSlots();
  }

  async function reopenSlot(id: string) {
    const { error } = await supabaseBrowser
      .from("lesson_slots")
      .update({ is_booked: false })
      .eq("id", id);
    if (error) alert("Error reopening slot.");
    else fetchSlots();
  }

  return (
    <div className="mt-10 border-t border-neutral-700 pt-6">
      <h3 className="text-2xl font-semibold text-primary mb-6 text-center">
        Manage Lesson Slots
      </h3>

      {/* Add Slot Form */}
      <form
        onSubmit={addSlot}
        className="space-y-4 mb-8 max-w-2xl mx-auto"
      >
        <div className="flex flex-wrap justify-center items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            required
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          />
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            required
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          />
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          >
            <option value={45}>45 Minutes</option>
            <option value={60}>1 Hour</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price === null ? "" : price}
            onChange={(e) => setPrice(e.target.value === "" ? null : parseFloat(e.target.value))}
            placeholder="Price ($)"
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          />
        </div>

        {/* Recurring Options */}
        <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
          <h4 className="text-sm font-semibold text-yellow-400 mb-3 text-center">
            Repeat on Days of Week (Optional)
          </h4>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {[
              { day: 0, label: "Sun" },
              { day: 1, label: "Mon" },
              { day: 2, label: "Tue" },
              { day: 3, label: "Wed" },
              { day: 4, label: "Thu" },
              { day: 5, label: "Fri" },
              { day: 6, label: "Sat" },
            ].map(({ day, label }) => (
              <label
                key={day}
                className="flex flex-col items-center cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedDays.includes(day)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedDays([...selectedDays, day].sort());
                    } else {
                      setSelectedDays(selectedDays.filter(d => d !== day));
                    }
                  }}
                  className="w-5 h-5 accent-yellow-400 mb-1"
                />
                <span className="text-xs text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          {selectedDays.length > 0 && (
            <div className="flex items-center justify-center gap-2">
              <label className="text-sm text-gray-300">
                Repeat for
              </label>
              <input
                type="number"
                min="1"
                max="52"
                value={numberOfWeeks}
                onChange={(e) => setNumberOfWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-center"
              />
              <span className="text-sm text-gray-300">
                week{numberOfWeeks !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {selectedDays.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-2">
              Will create {selectedDays.length * numberOfWeeks} slot{selectedDays.length * numberOfWeeks !== 1 ? 's' : ''} at this time
            </p>
          )}
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={loading}
            className="btn-signup px-6 py-2 rounded-md"
          >
            {loading ? "Adding Slots..." : selectedDays.length > 0 ? `Add ${selectedDays.length * numberOfWeeks} Slot${selectedDays.length * numberOfWeeks !== 1 ? 's' : ''}` : "Add Slot"}
          </button>
        </div>
      </form>

      {/* Existing Slots List */}
      <div className="space-y-3">
        {slots.length === 0 && (
          <p className="text-gray-400 text-center">No lesson slots yet.</p>
        )}

        {slots.map((slot) => {
          const start = new Date(slot.start_time);
          const end = new Date(slot.end_time);
          const formattedDate = start.toLocaleDateString();
          const formattedTime = `${start.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })} - ${end.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`;

          return (
            <div
              key={slot.id}
              className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-lg border ${
                slot.is_booked
                  ? "border-red-400 bg-neutral-900/70"
                  : "border-yellow-400 bg-neutral-900/50"
              }`}
            >
              <div>
                <p className="text-gray-200 font-medium">
                  {formattedDate} ({slot.duration_minutes} min)
                </p>
                <p className="text-gray-400">{formattedTime}</p>
                {slot.is_booked && (
                  <p className="text-sm text-red-400 mt-1">
                    Booked by {slot.student_name || "Unknown"} (
                    {slot.student_email || "no email"})
                  </p>
                )}
              </div>

              <div className="flex gap-3 justify-center">
                {!slot.is_booked ? (
                  <button
                    onClick={() => deleteSlot(slot.id)}
                    className="text-red-400 hover:text-red-500 text-sm"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    onClick={() => reopenSlot(slot.id)}
                    className="text-yellow-400 hover:text-yellow-500 text-sm"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
