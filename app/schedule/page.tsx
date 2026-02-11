"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ScheduleCalendar, { type ScheduleSlot } from "@/components/ScheduleCalendar";
import { XMarkIcon } from "@heroicons/react/24/solid";

const POSITIONS = [
  "Beginner Lead Teacher Week A",
  "Beginner Follow Teacher Week A",
  "Beginner Lead Teacher Week B",
  "Beginner Follow Teacher Week B",
  "Beginner Lead Teacher Week C",
  "Beginner Follow Teacher Week C",
  "Doorman",
  "Other Help",
] as const;

interface EventOption {
  id: string;
  title: string;
  date: string;
  start_time?: string;
  location?: string;
}

interface InstructorOption {
  id: string;
  first_name?: string;
  last_name?: string;
  displayName: string;
  role?: string;
}

export default function SchedulePage() {
  const router = useRouter();
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [addPosition, setAddPosition] = useState<string>(POSITIONS[0]);
  const [addEventId, setAddEventId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    const token = session?.access_token;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const loadData = useCallback(async () => {
    const headers = await getAuthHeaders();
    const [eventsRes, slotsRes, instructorsRes] = await Promise.all([
      fetch("/api/schedule/events", { headers }),
      fetch("/api/schedule/slots", { headers }),
      fetch("/api/schedule/instructors", { headers }),
    ]);

    if (eventsRes.status === 403 || eventsRes.status === 401) {
      setRole(null);
      setSlots([]);
      setEvents([]);
      setInstructors([]);
      setLoading(false);
      return;
    }

    if (!eventsRes.ok || !slotsRes.ok) {
      setError("Failed to load schedule");
      setLoading(false);
      return;
    }

    const eventsData = await eventsRes.json();
    const slotsData = await slotsRes.json();
    const instructorsData = instructorsRes.ok ? await instructorsRes.json() : { instructors: [] };

    setEvents(eventsData.events || []);
    setSlots(slotsData.slots || []);
    setInstructors(instructorsData.instructors || []);
    setError(null);
    setLoading(false);
  }, [getAuthHeaders]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabaseBrowser
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const roleLower = (profile?.role || "").toLowerCase();
      const isAdmin = roleLower === "admin";
      const isInstructor = roleLower === "instructor" || roleLower.includes("instructor");
      if (!isAdmin && !isInstructor) {
        setRole(null);
        setLoading(false);
        return;
      }
      setRole(isAdmin ? "admin" : "instructor");

      if (!cancelled) await loadData();
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router, loadData]);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEventId) return;
    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/schedule/slots", {
        method: "POST",
        headers,
        body: JSON.stringify({ position: addPosition, event_id: addEventId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to add slot");
        return;
      }
      setShowAddSlot(false);
      setAddEventId("");
      setAddPosition(POSITIONS[0]);
      await loadData();
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <section className="max-w-5xl mx-auto text-center px-4 py-10">
        <p className="text-gray-400">Loading schedule…</p>
      </section>
    );
  }

  if (role === null && !loading) {
    return (
      <section className="max-w-5xl mx-auto text-center px-4 py-10">
        <h2 className="text-2xl font-semibold text-primary mb-4">Schedule</h2>
        <p className="text-gray-400">You must be an instructor or admin to view the schedule.</p>
        <button
          type="button"
          onClick={() => router.push("/auth")}
          className="mt-4 btn-signup px-4 py-2 rounded"
        >
          Sign In
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto text-center px-4">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-3xl font-semibold text-primary">Schedule</h2>
        {role === "admin" && (
          <button
            type="button"
            onClick={() => setShowAddSlot(true)}
            className="btn-signup text-sm px-4 py-2 rounded-md"
          >
            Add Slot
          </button>
        )}
      </div>

      {error && (
        <p className="text-red-400 mb-4">{error}</p>
      )}

      <ScheduleCalendar
        slots={slots}
        currentUserId={userId}
        isAdmin={role === "admin"}
        instructors={instructors}
        onRefresh={loadData}
        getAuthHeaders={getAuthHeaders}
      />

      {showAddSlot && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddSlot(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-neutral-900 text-neutral-100 rounded-lg shadow-lg max-w-md w-full mx-4 p-6 border border-neutral-700"
          >
            <button
              type="button"
              className="absolute top-3 right-3 text-neutral-400 hover:text-primary"
              onClick={() => setShowAddSlot(false)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-bold text-primary mb-4">Add Event Slot</h3>
            <form onSubmit={handleAddSlot} className="space-y-4">
              <div>
                <label className="block text-left text-sm font-medium text-gray-300 mb-1">
                  Event
                </label>
                <select
                  value={addEventId}
                  onChange={(e) => setAddEventId(e.target.value)}
                  className="w-full rounded-md bg-neutral-800 border border-neutral-600 text-white px-3 py-2"
                  required
                >
                  <option value="">Select an event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} – {new Date(ev.starts_at).toLocaleDateString()}
                      {ev.starts_at ? ` ${new Date(ev.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-left text-sm font-medium text-gray-300 mb-1">
                  Position
                </label>
                <select
                  value={addPosition}
                  onChange={(e) => setAddPosition(e.target.value)}
                  className="w-full rounded-md bg-neutral-800 border border-neutral-600 text-white px-3 py-2"
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={adding || !addEventId}
                  className="btn-signup px-4 py-2 rounded disabled:opacity-50"
                >
                  {adding ? "Adding…" : "Add Slot"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSlot(false)}
                  className="px-4 py-2 rounded bg-neutral-700 text-gray-300 hover:bg-neutral-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
