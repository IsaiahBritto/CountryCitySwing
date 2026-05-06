"use client";

import { useState } from "react";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isoWeek from "dayjs/plugin/isoWeek";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { StarIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { getEventDateStringInChicago, getTodayStringInChicago, isEventPastInChicago } from "@/lib/utils/dateHelpers";

dayjs.extend(weekday);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

export interface ScheduleSlot {
  id: string;
  position: string;
  event_id: string;
  assignee_id: string | null;
  assigned_at: string | null;
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at?: string | null;
    location?: string;
  } | null;
  assignee: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
}

export interface InstructorOption {
  id: string;
  first_name?: string;
  last_name?: string;
  displayName: string;
  role?: string;
}

interface ScheduleCalendarProps {
  slots: ScheduleSlot[];
  currentUserId: string | null;
  isAdmin: boolean;
  instructors?: InstructorOption[];
  onRefresh: () => void;
  getAuthHeaders: () => Promise<HeadersInit>;
}

const today = getTodayStringInChicago();

export default function ScheduleCalendar({
  slots,
  currentUserId,
  isAdmin,
  instructors = [],
  onRefresh,
  getAuthHeaders,
}: ScheduleCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySlots, setDaySlots] = useState<ScheduleSlot[]>([]);
  const [showDayModal, setShowDayModal] = useState(false);
  const [signingUp, setSigningUp] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<string | null>(null);
  const [removeModal, setRemoveModal] = useState<{ slotId: string; name: string; position: string } | null>(null);
  const [assignModal, setAssignModal] = useState<{ slotId: string; position: string } | null>(null);
  const [assigneeSelectId, setAssigneeSelectId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  // Show everyone except admin (instructors + any other non-admin role); sort by first name
  const instructorsOnly = [...instructors]
    .filter((i) => (i.role || "").trim().toLowerCase() !== "admin")
    .sort((a, b) => (a.first_name || "").localeCompare(b.first_name || "", undefined, { sensitivity: "base" }));

  const daysInMonth = currentMonth.daysInMonth();
  const firstDayOfMonth = currentMonth.startOf("month").day();
  const startDayIndex = firstDayOfMonth;

  const weeks: (number | null)[][] = [];
  let currentDay = 1 - startDayIndex;
  while (currentDay <= daysInMonth) {
    const week: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (currentDay > 0 && currentDay <= daysInMonth) week.push(currentDay);
      else week.push(null);
      currentDay++;
    }
    weeks.push(week);
  }

  const nextMonth = () => setCurrentMonth(currentMonth.add(1, "month"));
  const prevMonth = () => setCurrentMonth(currentMonth.subtract(1, "month"));

  const getSlotsForDay = (day: number): ScheduleSlot[] => {
    const dateStr = currentMonth.date(day).format("YYYY-MM-DD");
    return slots.filter((s) => s.event?.starts_at && getEventDateStringInChicago(s.event.starts_at) === dateStr);
  };

  /** Number of slots on this day that have no assignee (available to pick up). */
  const getAvailableCountForDay = (day: number): number => {
    return getSlotsForDay(day).filter((s) => !s.assignee_id).length;
  };

  const handleDayClick = (day: number) => {
    const dateSlots = getSlotsForDay(day);
    if (dateSlots.length === 0) return;
    const dateStr = currentMonth.date(day).format("YYYY-MM-DD");
    setSelectedDate(dateStr);
    setDaySlots(dateSlots);
    setShowDayModal(true);
  };

  const closeDayModal = () => {
    setShowDayModal(false);
    setSelectedDate(null);
    setDaySlots([]);
  };

  const handleSignUp = async (slotId: string) => {
    setSigningUp(slotId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/schedule/slots/${slotId}/signup`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to sign up");
        return;
      }
      onRefresh();
    } finally {
      setSigningUp(null);
    }
  };

  const openRemoveModal = (slotId: string, name: string, position: string) => {
    setRemoveModal({ slotId, name, position });
  };

  const closeRemoveModal = () => setRemoveModal(null);

  const openAssignModal = (slotId: string, position: string) => {
    setAssignModal({ slotId, position });
    setAssigneeSelectId("");
  };

  const closeAssignModal = () => {
    setAssignModal(null);
    setAssigneeSelectId("");
  };

  const handleAssign = async () => {
    if (!assignModal || !assigneeSelectId) return;
    setAssigning(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/schedule/slots/${assignModal.slotId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ assignee_id: assigneeSelectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to assign");
        return;
      }
      closeAssignModal();
      onRefresh();
    } finally {
      setAssigning(false);
    }
  };

  const handleCancel = async () => {
    if (!removeModal) return;
    const { slotId, name } = removeModal;
    setCancelling(slotId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/schedule/slots/${slotId}/cancel`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to remove");
        return;
      }
      closeRemoveModal();
      onRefresh();
    } finally {
      setCancelling(null);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Delete this slot? This cannot be undone.")) return;
    setDeletingSlot(slotId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/schedule/slots/${slotId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete slot");
        return;
      }
      onRefresh();
      if (modalDaySlots.length <= 1) closeDayModal();
    } finally {
      setDeletingSlot(null);
    }
  };

  /** Full name for modal / labels */
  const assigneeName = (s: ScheduleSlot) =>
    s.assignee
      ? [s.assignee.first_name, s.assignee.last_name].filter(Boolean).join(" ") || "-"
      : s.assignee_id
        ? "Signed up"
        : null;

  /** First name + last initial for grey button (e.g. "Jane S") */
  const assigneeButtonLabel = (s: ScheduleSlot): string | null => {
    if (!s.assignee_id) return null;
    if (!s.assignee) return "Signed up";
    const first = (s.assignee.first_name || "").trim();
    const last = (s.assignee.last_name || "").trim();
    const lastInitial = last ? last.charAt(0).toUpperCase() : "";
    if (!first && !last) return "Signed up";
    return lastInitial ? `${first} ${lastInitial}`.trim() : first || "Signed up";
  };

  // Use current slots for the selected date so modal updates after signup/cancel/delete
  const modalDaySlots =
    selectedDate != null
      ? slots.filter((s) => s.event?.starts_at && getEventDateStringInChicago(s.event.starts_at) === selectedDate)
      : [];

  const slotsByEvent = modalDaySlots.reduce<Record<string, ScheduleSlot[]>>((acc, s) => {
    const eid = String(s.event_id);
    if (!acc[eid]) acc[eid] = [];
    acc[eid].push(s);
    return acc;
  }, {});

  return (
    <>
      <div className="bg-neutral-800 text-neutral-100 rounded-lg p-6 shadow-lg max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <button
            type="button"
            onClick={prevMonth}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
          >
            {"\u2190"}
          </button>
          <h2 className="text-xl font-semibold text-primary">
            {currentMonth.format("MMMM YYYY")}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
          >
            {"\u2192"}
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center font-semibold mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-sm text-gray-300">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2 text-center">
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              const daySlotsCount = day ? getSlotsForDay(day).length : 0;
              const availableCount = day ? getAvailableCountForDay(day) : 0;
              const hasSlots = daySlotsCount > 0;
              const dateStr = day && currentMonth.date(day).format("YYYY-MM-DD");
              const isToday = dateStr === today;
              return (
                <div
                  key={`${wi}-${di}`}
                  onClick={() => hasSlots && day && handleDayClick(day)}
                  className={`group h-16 flex flex-col justify-center items-center rounded-md transition overflow-hidden
                    ${hasSlots ? "bg-primary text-black hover:bg-yellow-400 cursor-pointer" : "bg-neutral-900 text-gray-300"}
                    ${isToday ? "ring-2 ring-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]" : ""}`}
                >
                  {day != null && <span className="font-medium text-base">{day}</span>}
                  {hasSlots && (
                    <div className="flex items-center gap-1 mt-1">
                      <StarIcon className="w-4 h-4 text-yellow-600 group-hover:text-black" />
                      <span className="text-xs font-semibold text-yellow-600 group-hover:text-black">
                        {availableCount}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showDayModal && selectedDate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm"
          onClick={closeDayModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-neutral-900 text-neutral-100 rounded-lg shadow-lg max-w-2xl w-full mx-4 border border-neutral-700 max-h-[90vh] overflow-hidden flex flex-col"
          >
            <button
              type="button"
              className="absolute top-3 right-3 text-neutral-400 hover:text-primary z-10"
              onClick={closeDayModal}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <div className="p-6 flex-1 overflow-y-auto">
              <h3 className="text-2xl font-bold text-primary mb-2">
                Schedule - {dayjs(selectedDate).format("dddd, MMMM D, YYYY")}
              </h3>
              <p className="text-gray-400 mb-6">
                {modalDaySlots.length} slot{modalDaySlots.length !== 1 ? "s" : ""} on this day
              </p>

              <div className="space-y-6">
                {Object.entries(slotsByEvent).map(([eventId, eventSlots]) => {
                  const ev = eventSlots[0]?.event;
                  return (
                    <div key={eventId} className="bg-neutral-800 rounded-lg p-4">
                      <h4 className="text-lg font-semibold text-primary mb-2">
                        {ev?.title ?? "Event"}
                      </h4>
                      {ev?.starts_at && (
                        <p className="text-sm text-gray-400 mb-3">
                          {new Date(ev.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          {ev?.location ? ` \u00b7  ${ev.location}` : ""}
                        </p>
                      )}
                      <ul className="space-y-2">
                        {eventSlots.map((slot) => {
                          const name = assigneeName(slot);
                          const buttonLabel = assigneeButtonLabel(slot);
                          const isMe = currentUserId && slot.assignee_id === currentUserId;
                          const eventIsPast =
                            !!slot.event?.starts_at &&
                            isEventPastInChicago(slot.event.starts_at, slot.event.ends_at ?? null);
                          const canSelfEditSlot = isAdmin || !eventIsPast;
                          return (
                            <li
                              key={slot.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-neutral-700 last:border-0"
                            >
                              <span className="text-neutral-200">{slot.position}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {buttonLabel ? (
                                  <>
                                    <span
                                      className="text-sm px-3 py-1.5 rounded border min-w-28 bg-neutral-700 text-gray-300 border-neutral-600 inline-block"
                                      title={name ? `Assigned: ${name}` : "Assigned"}
                                    >
                                      {buttonLabel}
                                    </span>
                                    {(isMe || isAdmin) && (
                                      <button
                                        type="button"
                                        disabled={cancelling === slot.id || !canSelfEditSlot}
                                        onClick={() => openRemoveModal(slot.id, name || buttonLabel, slot.position)}
                                        className="text-sm px-3 py-1.5 rounded border border-red-800/80 bg-red-900/40 text-red-200 hover:bg-red-800/60 disabled:opacity-50"
                                        title={
                                          canSelfEditSlot
                                            ? "Remove from this slot"
                                            : "This event is locked for instructors after the event day"
                                        }
                                      >
                                        {cancelling === slot.id ? "Removing�" : "Remove"}
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      disabled={!!signingUp || !canSelfEditSlot}
                                      onClick={() => handleSignUp(slot.id)}
                                      className="btn-signup text-sm px-3 py-1.5 rounded"
                                      title={
                                        canSelfEditSlot
                                          ? "Sign up for this slot"
                                          : "This event is locked for instructors after the event day"
                                      }
                                    >
                                      {signingUp === slot.id ? "�" : "Sign Me Up!"}
                                    </button>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => openAssignModal(slot.id, slot.position)}
                                        className="text-sm px-3 py-1.5 rounded border border-primary/60 bg-primary/20 text-primary hover:bg-primary/30"
                                        title="Assign an instructor"
                                      >
                                        Assign
                                      </button>
                                    )}
                                  </>
                                )}
                                {isAdmin && (
                                  <button
                                    type="button"
                                    disabled={deletingSlot === slot.id}
                                    onClick={() => handleDeleteSlot(slot.id)}
                                    className="text-sm px-2 py-1 rounded bg-red-900/80 hover:bg-red-800 text-red-200 disabled:opacity-50"
                                    title="Delete this slot"
                                  >
                                    {deletingSlot === slot.id ? "�" : "Delete"}
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove assignee confirmation modal */}
      {removeModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[60] bg-black/60 backdrop-blur-sm"
          onClick={closeRemoveModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-neutral-900 text-neutral-100 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 border border-neutral-700"
          >
            <h3 className="text-xl font-bold text-primary mb-2">Remove from slot?</h3>
            <p className="text-gray-300 mb-6">
              Remove <strong className="text-primary">{removeModal.name}</strong> from{" "}
              <strong>{removeModal.position}</strong>? They will receive a confirmation email.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeRemoveModal}
                className="px-4 py-2 rounded-lg bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={cancelling === removeModal.slotId}
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {cancelling === removeModal.slotId ? "Removing�" : "Remove from slot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign instructor modal (admin only) */}
      {assignModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[60] bg-black/60 backdrop-blur-sm"
          onClick={closeAssignModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-neutral-900 text-neutral-100 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 border border-neutral-700"
          >
            <h3 className="text-xl font-bold text-primary mb-2">Assign instructor</h3>
            <p className="text-gray-400 mb-4">
              Assign someone to <strong className="text-primary">{assignModal.position}</strong>
            </p>
            <label className="block text-sm font-medium text-gray-300 mb-2">Instructor</label>
            <select
              value={assigneeSelectId}
              onChange={(e) => setAssigneeSelectId(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-600 text-white px-3 py-2.5 mb-6 focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">Select an instructor</option>
              {instructorsOnly.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.displayName}
                </option>
              ))}
            </select>
            {instructorsOnly.length === 0 && (
              <p className="text-gray-500 text-sm mb-4">No instructors found. Add instructor role in profiles.</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeAssignModal}
                className="px-4 py-2 rounded-lg bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!assigneeSelectId || assigning}
                onClick={handleAssign}
                className="px-5 py-2.5 rounded-lg bg-yellow-500 text-black font-semibold border-2 border-yellow-400 shadow-[0_0_14px_rgba(234,179,8,0.5)] hover:bg-yellow-400 hover:shadow-[0_0_18px_rgba(234,179,8,0.6)] disabled:opacity-50 disabled:shadow-none transition-all"
              >
                {assigning ? "Assigning�" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
