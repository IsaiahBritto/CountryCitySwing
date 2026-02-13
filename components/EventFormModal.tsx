"use client";

import { useState, useEffect, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const CLASS_INTRO = "This is your one stop shop for weekly country swing fun! ";
const DEFAULT_UPPER_LEVEL_NAMES = "Malissa and Isaiah";
const DEFAULT_BEGINNER_SENTENCE = "our team of amazing beginner instructors lead the beginner class scheduled weeks";

/** Extract "A", "B", or "C" from slot position e.g. "Beginner Lead Teacher Week A". */
function getWeekLetterFromPosition(position: string): string | null {
  const m = position.match(/Week ([ABC])/i);
  return m ? m[1].toUpperCase() : null;
}

function buildClassDescription(upperNames: string, beginnerPart: string): string {
  return (
    CLASS_INTRO +
    upperNames +
    " will be instructing the upper level class while " +
    beginnerPart
  );
}

/** Parse existing Class description into upper-level names and beginner part. */
function parseClassDescription(description: string): { upperNames: string; beginnerPart: string } {
  const sep = " will be instructing the upper level class while ";
  const idx = description.indexOf(sep);
  if (idx === -1) {
    return { upperNames: DEFAULT_UPPER_LEVEL_NAMES, beginnerPart: DEFAULT_BEGINNER_SENTENCE };
  }
  const upperNames = description.slice(0, idx).replace(CLASS_INTRO, "").trim() || DEFAULT_UPPER_LEVEL_NAMES;
  const beginnerPart = description.slice(idx + sep.length).trim() || DEFAULT_BEGINNER_SENTENCE;
  return { upperNames, beginnerPart };
}

interface Event {
  id?: number;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location: string;
  description?: string;
  signupLink?: string;
  signup_link?: string; // Database column name
  price?: number | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  ccs_team_price?: number | null;
  type?: string;
}

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
  onSuccess: () => void;
}

export default function EventFormModal({
  open,
  onClose,
  event,
  onSuccess,
}: EventFormModalProps) {
  const [formData, setFormData] = useState<Event>({
    title: "",
    starts_at: "",
    ends_at: undefined,
    location: "",
    description: "",
    signupLink: "",
    price: undefined,
    strictly_price: undefined,
    jnj_price: undefined,
    ccs_team_price: undefined,
    type: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [classUpperLevelNames, setClassUpperLevelNames] = useState(DEFAULT_UPPER_LEVEL_NAMES);
  const [classBeginnerPart, setClassBeginnerPart] = useState(DEFAULT_BEGINNER_SENTENCE);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const upperNamesRef = useRef(classUpperLevelNames);
  upperNamesRef.current = classUpperLevelNames;

  const isEditMode = !!event;
  const isClassType = (formData.type || "").trim().toLowerCase() === "class";

  useEffect(() => {
    if (open) {
      if (event) {
        // Format starts_at for datetime-local input (YYYY-MM-DDTHH:mm)
        const startsAtStr = event.starts_at
          ? new Date(event.starts_at).toISOString().slice(0, 16)
          : "";
        const isConvention = (event.type || "").trim().toLowerCase() === "convention";
        const endsAtStr = isConvention && event.ends_at
          ? new Date(event.ends_at).toISOString().slice(0, 16)
          : "";

        const isClass = (event.type || "").trim().toLowerCase() === "class";
        let description = event.description || "";
        let upperNames = DEFAULT_UPPER_LEVEL_NAMES;
        let beginnerPart = DEFAULT_BEGINNER_SENTENCE;

        if (isClass && description) {
          const parsed = parseClassDescription(description);
          upperNames = parsed.upperNames;
          beginnerPart = parsed.beginnerPart;
        }

        setClassUpperLevelNames(upperNames);
        setClassBeginnerPart(beginnerPart);

        if (isClass && !description) {
          description = buildClassDescription(upperNames, beginnerPart);
        }

        setFormData({
          title: event.title || "",
          starts_at: startsAtStr,
          ends_at: isConvention ? (endsAtStr || undefined) : undefined,
          location: event.location || "",
          description,
          signupLink: event.signupLink || event.signup_link || "",
          price: event.price ?? undefined,
          strictly_price: event.strictly_price ?? undefined,
          jnj_price: event.jnj_price ?? undefined,
          ccs_team_price: event.ccs_team_price ?? undefined,
          type: event.type || "",
        });
      } else {
        setClassUpperLevelNames(DEFAULT_UPPER_LEVEL_NAMES);
        setClassBeginnerPart(DEFAULT_BEGINNER_SENTENCE);
        setFormData({
          title: "",
          starts_at: "",
          ends_at: undefined,
          location: "",
          description: "",
          signupLink: "",
          price: undefined,
          strictly_price: undefined,
          jnj_price: undefined,
          ccs_team_price: undefined,
          type: "",
        });
      }
      setError("");
    }
  }, [open, event]);

  // Keep modal description in sync when Class parts change (e.g. after schedule fetch updates classBeginnerPart).
  useEffect(() => {
    if (!open || !isClassType) return;
    const built = buildClassDescription(classUpperLevelNames, classBeginnerPart);
    setFormData((prev) => (prev.description === built ? prev : { ...prev, description: built }));
  }, [open, isClassType, classUpperLevelNames, classBeginnerPart]);

  // When modal is open and event is Class with an id, fetch schedule slots and update beginner part.
  // Use event?.type (not formData.type) so we run as soon as the modal opens with a Class event,
  // before form state has been updated.
  useEffect(() => {
    const isEventClass = (event?.type || "").trim().toLowerCase() === "class";
    if (!open || !event?.id || !isEventClass) return;

    let cancelled = false;
    setScheduleLoading(true);

    const eventId = event.id;

    (async () => {
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancelled) return;

        const res = await fetch(`/api/schedule/slots?event_id=${encodeURIComponent(eventId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const slots: Array<{ position: string; assignee?: { first_name?: string; last_name?: string } | null }> = data.slots || [];

        const beginnerSlots = slots.filter(
          (s) => s.position && s.position.toLowerCase().includes("beginner") && s.assignee
        );
        const weekLetter = beginnerSlots.length > 0 ? getWeekLetterFromPosition(beginnerSlots[0].position) : null;
        // Use first name only for beginner instructors
        const firstNames = [...new Set(beginnerSlots.map((s) => (s.assignee!.first_name || "").trim()).filter(Boolean))];

        if (cancelled) return;

        if (firstNames.length > 0 && weekLetter) {
          const beginnerSentence =
            firstNames.length === 1
              ? `${firstNames[0]} will be teaching Beginner Week ${weekLetter}!`
              : firstNames.length === 2
                ? `${firstNames[0]} and ${firstNames[1]} will be teaching Beginner Week ${weekLetter}!`
                : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]} will be teaching Beginner Week ${weekLetter}!`;
          setClassBeginnerPart(beginnerSentence);
        }
      } catch (_) {
        if (!cancelled) setScheduleLoading(false);
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, event?.id, event?.type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (formData.ends_at && formData.starts_at && new Date(formData.ends_at) < new Date(formData.starts_at)) {
      setError("End date & time must be on or after start date & time.");
      return;
    }
    setLoading(true);

    try {
      const url = isEditMode
        ? `/api/events/${event.id}`
        : "/api/events";
      const method = isEditMode ? "PUT" : "POST";

      // Prepare data
      const submitData: any = {
        title: formData.title,
        starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : "",
        location: formData.location,
      };

      if (formData.description !== undefined) {
        submitData.description = isClassType
          ? buildClassDescription(classUpperLevelNames, classBeginnerPart)
          : (formData.description || "");
      }
      if (formData.signupLink !== undefined) submitData.signupLink = formData.signupLink || "";
      if (formData.price !== undefined) submitData.price = formData.price != null ? Number(formData.price) : null;
      if (formData.strictly_price !== undefined) submitData.strictly_price = formData.strictly_price != null ? Number(formData.strictly_price) : null;
      if (formData.jnj_price !== undefined) submitData.jnj_price = formData.jnj_price != null ? Number(formData.jnj_price) : null;
      if (formData.ccs_team_price !== undefined) submitData.ccs_team_price = formData.ccs_team_price != null ? Number(formData.ccs_team_price) : null;
      if (formData.type !== undefined) submitData.type = formData.type || "";
      const isConvention = (formData.type || "").trim().toLowerCase() === "convention";
      submitData.ends_at = isConvention && formData.ends_at ? new Date(formData.ends_at).toISOString() : null;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.details 
          ? `${result.error}: ${result.details}` 
          : result.error || "Failed to save event";
        throw new Error(errorMsg);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save event");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60">
      <div className="bg-neutral-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-white shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-primary">
            {isEditMode ? "Edit Event" : "Add New Event"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date & time *
              </label>
              <input
                type="datetime-local"
                required
                value={formData.starts_at}
                onChange={(e) =>
                  setFormData({ ...formData, starts_at: e.target.value })
                }
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Location *
              </label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {(formData.type || "").trim().toLowerCase() === "convention" && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                End date &amp; time (optional, for multi-day)
              </label>
              <input
                type="datetime-local"
                value={formData.ends_at ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, ends_at: e.target.value || undefined })
                }
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

            <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type (e.g., "Class", "Workshop", "Comp", "Convention")
            </label>
            <input
              type="text"
              placeholder="Class, Workshop, Comp, Convention..."
              value={formData.type}
              onChange={(e) => {
                const newType = e.target.value;
                const wasClass = (formData.type || "").trim().toLowerCase() === "class";
                const isNowClass = (newType || "").trim().toLowerCase() === "class";
                const wasConvention = (formData.type || "").trim().toLowerCase() === "convention";
                const isNowConvention = (newType || "").trim().toLowerCase() === "convention";
                setFormData((prev) => {
                  const next = { ...prev, type: newType };
                  if (!wasClass && isNowClass) {
                    next.description = buildClassDescription(classUpperLevelNames, classBeginnerPart);
                  }
                  if (wasConvention && !isNowConvention) {
                    next.ends_at = undefined;
                  }
                  return next;
                });
              }}
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {isClassType && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Upper level instructors (for Class description)
              </label>
              <input
                type="text"
                value={classUpperLevelNames}
                onChange={(e) => {
                  const names = e.target.value;
                  setClassUpperLevelNames(names);
                  setFormData((prev) => ({
                    ...prev,
                    description: buildClassDescription(names, classBeginnerPart),
                  }));
                }}
                placeholder={DEFAULT_UPPER_LEVEL_NAMES}
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {scheduleLoading && (
                <p className="text-xs text-gray-400 mt-1">Checking staff schedule…</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.type === "Comp" ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price ($) — optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to hide"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Strictly Price ($) — optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.strictly_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        strictly_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to hide"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    JnJ Price ($) — optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.jnj_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        jnj_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to hide"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    CCS Team Price ($) — optional, shown to instructors
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.ccs_team_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ccs_team_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to use regular price"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    CCS Team Price ($) — optional, shown to instructors
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.ccs_team_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ccs_team_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to use regular price"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Signup Link
            </label>
            <input
              type="url"
              value={formData.signupLink}
              onChange={(e) =>
                setFormData({ ...formData, signupLink: e.target.value })
              }
              placeholder="https://..."
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-md btn-signup disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Saving..."
                : isEditMode
                ? "Update Event"
                : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
