"use client";

import { useState, useEffect, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  DEFAULT_TIME_ZONE,
  toDateTimeLocalInTimeZone,
  fromDateTimeLocalInTimeZone,
} from "@/lib/utils/dateHelpers";
import {
  hasDuplicatePriceChangeDates,
  isPriceChangeLocked,
  normalizePriceChanges,
  type PriceChange,
} from "@/lib/utils/workshopPricing";

const CLASS_INTRO = "This is your one stop shop for weekly country swing fun! ";
const DEFAULT_UPPER_LEVEL_NAMES = "Malissa and Isaiah";
const DEFAULT_BEGINNER_SENTENCE = "our team of amazing beginner instructors lead the beginner class scheduled weeks";
/** Canonical title for weekly Nashville class nights (matches admin / finances). */
const NASHVILLE_CLASS_EVENT_TITLE = "Nashville Country Swing Nights!";

/** Stored `events.type` values used across the site (carousel, calendar, workshop spotlight). */
const EVENT_TYPE_OPTIONS = [
  { value: "Class", label: "Class" },
  { value: "Workshop", label: "Workshop" },
  { value: "Social", label: "Social" },
  { value: "Comp", label: "Comp" },
  { value: "Convention", label: "Convention" },
] as const;

const DEFAULT_REFUND_CLASS_SOCIAL =
  "Refunds will be issued if notice is given prior to event start time. Otherwise, contact CCS.";

const DEFAULT_REFUND_WORKSHOP =
  "Refunds will be given in full up until one week prior to the event. During the week of the event, a 50% refund will be given. Day-of cancellations will not receive a refund. After two cancellations or no-show/no-payment for workshops, payment via Stripe will be required for future workshops. Contact CCS with any questions.";

function defaultRefundStatementForType(type: string | undefined | null): string {
  const t = (type || "").trim().toLowerCase();
  if (t === "class" || t === "social") return DEFAULT_REFUND_CLASS_SOCIAL;
  if (t === "workshop") return DEFAULT_REFUND_WORKSHOP;
  return "";
}

/** Keep auto-filled defaults in sync when type changes; don't overwrite custom text. */
function nextRefundStatementOnTypeChange(
  prevStatement: string | undefined | null,
  prevType: string | undefined | null,
  nextType: string
): string {
  const current = (prevStatement || "").trim();
  const prevDefault = defaultRefundStatementForType(prevType);
  const nextDefault = defaultRefundStatementForType(nextType);
  if (!current || current === prevDefault) return nextDefault;
  return current;
}

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

function looksLikeAutoClassDescription(description: string): boolean {
  return (
    description.startsWith(CLASS_INTRO) &&
    description.includes(" will be instructing the upper level class while ")
  );
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
  time_zone?: string | null;
  price?: number | null;
  price_changes?: PriceChange[];
  ccs_team_price_changes?: PriceChange[];
  strictly_price?: number | null;
  jnj_price?: number | null;
  ccs_team_price?: number | null;
  type?: string;
  refund_statement?: string | null;
  refundStatement?: string | null;
  all_three_classes?: boolean;
  allThreeClasses?: boolean;
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
    time_zone: DEFAULT_TIME_ZONE,
    price: undefined,
    price_changes: [],
    ccs_team_price_changes: [],
    strictly_price: undefined,
    jnj_price: undefined,
    ccs_team_price: undefined,
    type: "",
    refundStatement: "",
    all_three_classes: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [classUpperLevelNames, setClassUpperLevelNames] = useState(DEFAULT_UPPER_LEVEL_NAMES);
  const [classBeginnerPart, setClassBeginnerPart] = useState(DEFAULT_BEGINNER_SENTENCE);
  const [classAutoDescription, setClassAutoDescription] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const upperNamesRef = useRef(classUpperLevelNames);
  upperNamesRef.current = classUpperLevelNames;

  const isEditMode = !!event;
  const typeNorm = (formData.type || "").trim().toLowerCase();
  const isClassType = typeNorm === "class";
  const isCompType = typeNorm === "comp";

  useEffect(() => {
    if (open) {
      if (event) {
        const tz = event.time_zone || DEFAULT_TIME_ZONE;
        // Format starts_at/ends_at in America/Chicago for datetime-local (avoids timezone shift on save)
        const startsAtStr = event.starts_at
          ? toDateTimeLocalInTimeZone(event.starts_at, tz)
          : "";
        const endsAtStr = event.ends_at
          ? toDateTimeLocalInTimeZone(event.ends_at, tz)
          : "";

        const isClass = (event.type || "").trim().toLowerCase() === "class";
        let description = event.description || "";
        let upperNames = DEFAULT_UPPER_LEVEL_NAMES;
        let beginnerPart = DEFAULT_BEGINNER_SENTENCE;
        let autoDesc = false;

        if (isClass) {
          if (!description) {
            autoDesc = true;
            description = buildClassDescription(upperNames, beginnerPart);
          } else if (looksLikeAutoClassDescription(description)) {
            autoDesc = true;
            const parsed = parseClassDescription(description);
            upperNames = parsed.upperNames;
            beginnerPart = parsed.beginnerPart;
          } else {
            autoDesc = false;
          }
        }

        setClassUpperLevelNames(upperNames);
        setClassBeginnerPart(beginnerPart);
        setClassAutoDescription(autoDesc);

        setFormData({
          title: event.title || "",
          starts_at: startsAtStr,
          ends_at: endsAtStr || undefined,
          location: event.location || "",
          description,
          signupLink: event.signupLink || event.signup_link || "",
          time_zone: tz,
          price: event.price ?? undefined,
          price_changes: normalizePriceChanges(event.price_changes),
          ccs_team_price_changes: normalizePriceChanges(event.ccs_team_price_changes),
          strictly_price: event.strictly_price ?? undefined,
          jnj_price: event.jnj_price ?? undefined,
          ccs_team_price: event.ccs_team_price ?? undefined,
          type: event.type || "",
          refundStatement: event.refundStatement || event.refund_statement || "",
          all_three_classes: Boolean(
            event.all_three_classes ?? event.allThreeClasses
          ),
        });
      } else {
        setClassUpperLevelNames(DEFAULT_UPPER_LEVEL_NAMES);
        setClassBeginnerPart(DEFAULT_BEGINNER_SENTENCE);
        setClassAutoDescription(false);
        setFormData({
          title: "",
          starts_at: "",
          ends_at: undefined,
          location: "",
          description: "",
          signupLink: "",
          time_zone: DEFAULT_TIME_ZONE,
          price: undefined,
          price_changes: [],
          ccs_team_price_changes: [],
          strictly_price: undefined,
          jnj_price: undefined,
          ccs_team_price: undefined,
          type: "",
          refundStatement: "",
          all_three_classes: false,
        });
      }
      setError("");
    }
  }, [open, event]);

  // Keep modal description in sync when Class parts change (e.g. after schedule fetch updates classBeginnerPart).
  useEffect(() => {
    if (!open || !isClassType || !classAutoDescription) return;
    const built = buildClassDescription(classUpperLevelNames, classBeginnerPart);
    setFormData((prev) => (prev.description === built ? prev : { ...prev, description: built }));
  }, [open, isClassType, classAutoDescription, classUpperLevelNames, classBeginnerPart]);

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
    const isSocialType = (formData.type || "").trim().toLowerCase() === "social";
    if (isSocialType && !formData.ends_at) {
      setError("Social events need an end time so Doorman slots can be opened for each hour.");
      return;
    }
    if (formData.ends_at && formData.starts_at) {
      const tz = formData.time_zone || DEFAULT_TIME_ZONE;
      const startISO = fromDateTimeLocalInTimeZone(formData.starts_at, tz);
      const endISO = fromDateTimeLocalInTimeZone(formData.ends_at, tz);
      if (startISO && endISO && endISO < startISO) {
        setError("End date & time must be on or after start date & time.");
        return;
      }
    }
    setLoading(true);

    try {
      const url = isEditMode
        ? `/api/events/${event.id}`
        : "/api/events";
      const method = isEditMode ? "PUT" : "POST";

      // In edit mode, if user didn't change start/end time, send original values so time never shifts
      const tz = formData.time_zone || DEFAULT_TIME_ZONE;
      const startUnchanged =
        isEditMode &&
        event?.starts_at &&
        formData.starts_at === toDateTimeLocalInTimeZone(event.starts_at, tz);
      const endUnchanged =
        isEditMode &&
        event?.ends_at != null &&
        formData.ends_at === toDateTimeLocalInTimeZone(event.ends_at, tz);

      const submitData: any = {
        title: formData.title,
        starts_at: startUnchanged
          ? event!.starts_at
          : formData.starts_at
            ? fromDateTimeLocalInTimeZone(formData.starts_at, tz)
            : "",
        location: formData.location,
        time_zone: tz,
      };

      if (formData.description !== undefined) {
        submitData.description =
          isClassType && classAutoDescription
            ? buildClassDescription(classUpperLevelNames, classBeginnerPart)
            : formData.description || "";
      }
      if (formData.signupLink !== undefined) submitData.signupLink = formData.signupLink || "";
      if (formData.price !== undefined) submitData.price = formData.price != null ? Number(formData.price) : null;
      const publicChanges = normalizePriceChanges(formData.price_changes);
      const teamChanges = normalizePriceChanges(formData.ccs_team_price_changes);
      if (hasDuplicatePriceChangeDates(publicChanges) || hasDuplicatePriceChangeDates(teamChanges)) {
        setError("Each price change date must be unique.");
        setLoading(false);
        return;
      }
      submitData.price_changes = publicChanges;
      submitData.ccs_team_price_changes = teamChanges;
      if (formData.strictly_price !== undefined) submitData.strictly_price = formData.strictly_price != null ? Number(formData.strictly_price) : null;
      if (formData.jnj_price !== undefined) submitData.jnj_price = formData.jnj_price != null ? Number(formData.jnj_price) : null;
      if (formData.ccs_team_price !== undefined) submitData.ccs_team_price = formData.ccs_team_price != null ? Number(formData.ccs_team_price) : null;
      if (formData.type !== undefined) submitData.type = formData.type || "";
      submitData.refundStatement =
        typeof formData.refundStatement === "string"
          ? formData.refundStatement.trim()
          : "";
      submitData.all_three_classes = isClassType && Boolean(formData.all_three_classes);
      submitData.ends_at = formData.ends_at
        ? endUnchanged
          ? event!.ends_at!
          : fromDateTimeLocalInTimeZone(formData.ends_at, tz)
        : null;

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Time zone *
              </label>
              <select
                value={formData.time_zone || DEFAULT_TIME_ZONE}
                onChange={(e) => setFormData({ ...formData, time_zone: e.target.value })}
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="America/Chicago">Central Time</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Times are saved relative to this event’s time zone.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type *
            </label>
            <select
              required
              value={formData.type || ""}
              onChange={(e) => {
                const newType = e.target.value;
                const wasClass = typeNorm === "class";
                const isNowClass = (newType || "").trim().toLowerCase() === "class";
                const wasConvention = typeNorm === "convention";
                const isNowConvention = (newType || "").trim().toLowerCase() === "convention";

                if (!wasClass && isNowClass) {
                  setClassAutoDescription(true);
                  setFormData((prev) => {
                    const next = {
                      ...prev,
                      type: newType,
                      description: buildClassDescription(classUpperLevelNames, classBeginnerPart),
                      title: NASHVILLE_CLASS_EVENT_TITLE,
                      refundStatement: nextRefundStatementOnTypeChange(
                        prev.refundStatement,
                        prev.type,
                        newType
                      ),
                    };
                    if (wasConvention && !isNowConvention) next.ends_at = undefined;
                    return next;
                  });
                  return;
                }

                if (wasClass && !isNowClass) {
                  setClassAutoDescription(false);
                }

                setFormData((prev) => {
                  const next = {
                    ...prev,
                    type: newType,
                    refundStatement: nextRefundStatementOnTypeChange(
                      prev.refundStatement,
                      prev.type,
                      newType
                    ),
                    ...(wasClass && !isNowClass ? { all_three_classes: false } : {}),
                  };
                  if (wasConvention && !isNowConvention) {
                    next.ends_at = undefined;
                  }
                  return next;
                });
              }}
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select type…</option>
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {formData.type &&
                !EVENT_TYPE_OPTIONS.some((opt) => opt.value === formData.type) && (
                  <option value={formData.type}>
                    {formData.type} (current)
                  </option>
                )}
            </select>
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

          {(formData.type || "").trim().toLowerCase() !== "convention" && !!formData.type && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                End date &amp; time
                {(formData.type || "").trim().toLowerCase() === "social" ? " *" : " (optional)"}
              </label>
              <input
                type="datetime-local"
                required={(formData.type || "").trim().toLowerCase() === "social"}
                value={formData.ends_at ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, ends_at: e.target.value || undefined })
                }
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-gray-400 mt-1">
                {(formData.type || "").trim().toLowerCase() === "social"
                  ? "Required. One Doorman slot is opened on the schedule for each hour from start to end."
                  : "Usually same day as start (e.g. end time). Leave blank if not needed."}
              </p>
            </div>
          )}

          {isClassType && (
            <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-neutral-600 bg-neutral-700 text-primary focus:ring-primary"
                checked={classAutoDescription}
                onChange={(e) => {
                  const on = e.target.checked;
                  setClassAutoDescription(on);
                  if (on) {
                    setFormData((prev) => ({
                      ...prev,
                      description: buildClassDescription(classUpperLevelNames, classBeginnerPart),
                      title: NASHVILLE_CLASS_EVENT_TITLE,
                    }));
                  }
                }}
              />
              <span>
                Use autogenerated weekly class description (and set title to{" "}
                <span className="font-medium text-primary">{NASHVILLE_CLASS_EVENT_TITLE}</span>
                ). Uncheck to write your own title and description.
              </span>
            </label>
          )}

          {isClassType && (
            <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-neutral-600 bg-neutral-700 text-primary focus:ring-primary"
                checked={Boolean(formData.all_three_classes)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    all_three_classes: e.target.checked,
                  }))
                }
              />
              <span>
                All Three Classes — require dancers to select which class they
                plan on taking (Beginner Side, Lower Level, or Upper Level)
                during registration.
              </span>
            </label>
          )}

          {isClassType && classAutoDescription && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Upper level instructors (for Class description)
              </label>
              <input
                type="text"
                value={classUpperLevelNames}
                onChange={(e) => setClassUpperLevelNames(e.target.value)}
                placeholder={DEFAULT_UPPER_LEVEL_NAMES}
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {scheduleLoading && (
                <p className="text-xs text-gray-400 mt-1">Checking staff schedule…</p>
              )}
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
              disabled={isClassType && classAutoDescription}
              className={`w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none ${
                isClassType && classAutoDescription ? "opacity-80 cursor-not-allowed" : ""
              }`}
            />
            {isClassType && classAutoDescription && (
              <p className="text-xs text-gray-400 mt-1">
                Generated from the template above. Uncheck “Use autogenerated…” to edit manually.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isCompType ? (
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
                {(formData.type || "").trim().toLowerCase() === "workshop" && (
                  <>
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Public price changes — optional (takes effect at midnight in event time zone)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              price_changes: [
                                ...(formData.price_changes || []),
                                { effective_date: "", price: formData.price ?? 0 },
                              ],
                            })
                          }
                          className="text-sm text-primary hover:underline"
                        >
                          + Add change
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(formData.price_changes || []).map((row, idx) => {
                          const locked = isPriceChangeLocked(
                            row.effective_date,
                            formData.time_zone
                          );
                          return (
                            <div key={`pub-${idx}`} className="flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                value={row.effective_date}
                                disabled={locked}
                                onChange={(e) => {
                                  const next = [...(formData.price_changes || [])];
                                  next[idx] = { ...next[idx], effective_date: e.target.value };
                                  setFormData({ ...formData, price_changes: next });
                                }}
                                className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.price}
                                disabled={locked}
                                onChange={(e) => {
                                  const next = [...(formData.price_changes || [])];
                                  next[idx] = {
                                    ...next[idx],
                                    price: e.target.value ? parseFloat(e.target.value) : 0,
                                  };
                                  setFormData({ ...formData, price_changes: next });
                                }}
                                className="w-28 px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                              />
                              {locked ? (
                                <span className="text-xs text-gray-400">Locked (in effect)</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (formData.price_changes || []).filter((_, i) => i !== idx);
                                    setFormData({ ...formData, price_changes: next });
                                  }}
                                  className="text-sm text-red-300 hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          CCS Team price changes — optional
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              ccs_team_price_changes: [
                                ...(formData.ccs_team_price_changes || []),
                                {
                                  effective_date: "",
                                  price: formData.ccs_team_price ?? formData.price ?? 0,
                                },
                              ],
                            })
                          }
                          className="text-sm text-primary hover:underline"
                        >
                          + Add change
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(formData.ccs_team_price_changes || []).map((row, idx) => {
                          const locked = isPriceChangeLocked(
                            row.effective_date,
                            formData.time_zone
                          );
                          return (
                            <div key={`team-${idx}`} className="flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                value={row.effective_date}
                                disabled={locked}
                                onChange={(e) => {
                                  const next = [...(formData.ccs_team_price_changes || [])];
                                  next[idx] = { ...next[idx], effective_date: e.target.value };
                                  setFormData({ ...formData, ccs_team_price_changes: next });
                                }}
                                className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.price}
                                disabled={locked}
                                onChange={(e) => {
                                  const next = [...(formData.ccs_team_price_changes || [])];
                                  next[idx] = {
                                    ...next[idx],
                                    price: e.target.value ? parseFloat(e.target.value) : 0,
                                  };
                                  setFormData({ ...formData, ccs_team_price_changes: next });
                                }}
                                className="w-28 px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                              />
                              {locked ? (
                                <span className="text-xs text-gray-400">Locked (in effect)</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (formData.ccs_team_price_changes || []).filter(
                                      (_, i) => i !== idx
                                    );
                                    setFormData({ ...formData, ccs_team_price_changes: next });
                                  }}
                                  className="text-sm text-red-300 hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
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

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Refund statement (optional)
            </label>
            <textarea
              value={formData.refundStatement || ""}
              onChange={(e) =>
                setFormData({ ...formData, refundStatement: e.target.value })
              }
              rows={4}
              placeholder="If set, signups must acknowledge this before submitting."
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs text-gray-400">
                If set, signups must acknowledge this before submitting. Class/Social and
                Workshop types get a default when selected.
              </p>
              {defaultRefundStatementForType(formData.type) && (
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      refundStatement: defaultRefundStatementForType(formData.type),
                    })
                  }
                  className="text-xs text-primary hover:text-yellow-300 underline underline-offset-2"
                >
                  Use default for this type
                </button>
              )}
            </div>
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
