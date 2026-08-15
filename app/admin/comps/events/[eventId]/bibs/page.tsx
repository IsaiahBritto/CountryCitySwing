"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { formatRegistrantCompLabels, type EventRegistrantPerson } from "@/lib/comps/eventRegistrants";
import EventStaffSection from "@/components/comps/admin/EventStaffSection";
import {
  canAccessCompEventOps,
  canManageCompEventStaff,
  isCompAdminRole,
  type MeResponse,
} from "@/lib/comps/compAccessClient";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

interface EventInfo {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
  type?: string | null;
}

const AUTO_SAVE_MS = 700;

export default function EventBibsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [canAccess, setCanAccess] = useState(false);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [roster, setRoster] = useState<EventRegistrantPerson[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const savedDraftRef = useRef<Record<string, string>>({});
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const rosterRef = useRef(roster);
  const draftRef = useRef(draft);
  rosterRef.current = roster;
  draftRef.current = draft;

  const hasDuplicate = useCallback((personKey: string, trimmed: string) => {
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) return false;
    for (const [key, val] of Object.entries(draftRef.current)) {
      if (key === personKey) continue;
      const other = val.trim();
      if (other && Number(other) === n) return true;
    }
    return false;
  }, []);

  const applyRoster = useCallback((rows: EventRegistrantPerson[]) => {
    setRoster(rows);
    const next: Record<string, string> = {};
    for (const r of rows) {
      next[r.personKey] = r.bibNumber != null ? String(r.bibNumber) : "";
    }
    setDraft(next);
    savedDraftRef.current = { ...next };
  }, []);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/comps/events/${eventId}/bibs`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setEvent(data.event ?? null);
    applyRoster(data.roster ?? []);
  }, [eventId, applyRoster]);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const meData = res.ok ? await res.json() : null;
      setMe(meData);
      const allowed = canAccessCompEventOps(meData, eventId);
      setCanAccess(allowed);
      if (allowed) await load();
      setLoading(false);
    })();
  }, [load]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(debounceTimersRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const scheduleLabel = useMemo(() => {
    if (!event?.starts_at) return null;
    return formatEventScheduleSubtitle(
      event.starts_at,
      event.ends_at,
      event.time_zone || DEFAULT_TIME_ZONE,
      event.type ?? "comp"
    );
  }, [event]);

  const duplicateNumbers = useMemo(() => {
    const seen = new Map<string, string>();
    const dupes = new Set<string>();
    for (const [key, val] of Object.entries(draft)) {
      const trimmed = val.trim();
      if (!trimmed) continue;
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0) continue;
      const prev = seen.get(String(n));
      if (prev) {
        dupes.add(String(n));
      } else {
        seen.set(String(n), key);
      }
    }
    return dupes;
  }, [draft]);

  const savePerson = useCallback(
    async (personKey: string, rawValue: string) => {
      const person = rosterRef.current.find((r) => r.personKey === personKey);
      if (!person) return;

      const trimmed = rawValue.trim();
      if (!trimmed) return;

      const bibNumber = Number(trimmed);
      if (!Number.isInteger(bibNumber) || bibNumber <= 0) return;
      if (hasDuplicate(personKey, trimmed)) return;
      if (savedDraftRef.current[personKey] === trimmed) return;

      setSavingKeys((prev) => new Set(prev).add(personKey));
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.delete(personKey);
        return next;
      });
      setError(null);

      const res = await authedFetch(`/api/admin/comps/events/${eventId}/bibs`, {
        method: "PATCH",
        body: JSON.stringify({
          assignments: [
            {
              bibId: person.bibId ?? undefined,
              personKey: person.personKey,
              bibNumber,
            },
          ],
        }),
      });

      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(personKey);
        return next;
      });

      if (!res.ok) {
        setError(await apiError(res));
        return;
      }

      const data = await res.json();
      const updated = (data.roster ?? []) as EventRegistrantPerson[];
      const row = updated.find((r) => r.personKey === personKey);
      if (row) {
        setRoster((prev) =>
          prev.map((r) => (r.personKey === personKey ? row : r))
        );
      }
      savedDraftRef.current[personKey] = trimmed;
      setSavedKeys((prev) => new Set(prev).add(personKey));
    },
    [eventId, hasDuplicate]
  );

  const scheduleSave = useCallback(
    (personKey: string, value: string) => {
      const existing = debounceTimersRef.current[personKey];
      if (existing) clearTimeout(existing);
      debounceTimersRef.current[personKey] = setTimeout(() => {
        void savePerson(personKey, value);
      }, AUTO_SAVE_MS);
    },
    [savePerson]
  );

  const flushSave = useCallback(
    (personKey: string, value: string) => {
      const existing = debounceTimersRef.current[personKey];
      if (existing) clearTimeout(existing);
      delete debounceTimersRef.current[personKey];
      void savePerson(personKey, value);
    },
    [savePerson]
  );

  const inputCls =
    "w-24 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1.5 font-mono text-sm text-white";

  const renderBibField = (person: EventRegistrantPerson) => {
    const val = draft[person.personKey] ?? "";
    const num = val.trim() ? Number(val) : null;
    const invalid =
      val.trim() !== "" &&
      (!Number.isInteger(num) || (num ?? 0) <= 0);
    const dupe =
      num != null &&
      Number.isInteger(num) &&
      duplicateNumbers.has(String(num));
    const isSaving = savingKeys.has(person.personKey);
    const isSaved =
      savedKeys.has(person.personKey) &&
      savedDraftRef.current[person.personKey] === val.trim() &&
      val.trim() !== "";

    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          className={
            inputCls +
            (invalid || dupe ? " border-red-500/70" : "")
          }
          value={val}
          onChange={(e) => {
            const next = e.target.value;
            setDraft((d) => ({
              ...d,
              [person.personKey]: next,
            }));
            setSavedKeys((prev) => {
              const s = new Set(prev);
              s.delete(person.personKey);
              return s;
            });
            scheduleSave(person.personKey, next);
          }}
          onBlur={(e) => flushSave(person.personKey, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder="—"
        />
        {isSaving && (
          <span className="text-xs text-neutral-500">…</span>
        )}
        {!isSaving && isSaved && !invalid && !dupe && (
          <span className="text-xs text-green-400">Saved</span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <main className="w-full py-10 text-neutral-400">
        Loading…
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="w-full py-10">
        <p className="text-red-300">You don&apos;t have access to this event.</p>
      </main>
    );
  }

  const isAdmin = isCompAdminRole(me?.profile?.role);
  const showStaffMgmt = canManageCompEventStaff(me);

  const anySaving = savingKeys.size > 0;

  return (
    <main className="w-full py-10">
      <Link
        href={isAdmin ? "/admin/comps" : `/admin/comps/events/${eventId}/ops`}
        className="mb-4 inline-block text-sm text-neutral-400 hover:text-white"
      >
        ← Back
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/comps/events/${eventId}/checkin`}
          className="text-sm text-primary hover:underline"
        >
          Open check-in →
        </Link>
        {isAdmin && (
          <Link
            href={`/admin/comps/events/${eventId}/ops`}
            className="text-sm text-neutral-400 hover:text-white"
          >
            Event ops hub
          </Link>
        )}
      </div>

      <h1 className="text-2xl font-bold text-white">Assign bib numbers</h1>
      {event && (
        <>
          <p className="mt-1 text-lg text-neutral-200">{event.title}</p>
          {scheduleLabel && (
            <p className="mt-0.5 text-sm text-neutral-400">{scheduleLabel}</p>
          )}
        </>
      )}

      <p className="mt-3 text-sm text-neutral-400">
        One bib per competitor for this comp event. Confirm each person&apos;s
        name and divisions before entering their bib number. Judges and
        Strictly-only follows are not listed. The same number applies across
        Jack &amp; Jill and Strictly divisions; Strictly couples display the
        lead&apos;s bib. Bib numbers save automatically when you enter them.
      </p>

      {anySaving && (
        <p className="mt-3 text-sm text-neutral-400">Saving…</p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showStaffMgmt && <EventStaffSection eventId={eventId} />}

      {roster.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">
          No registrants found for this event yet.
        </p>
      ) : (
        <>
          <div className="mt-6 md:hidden space-y-3">
            {roster.map((person) => {
              const compLabels = formatRegistrantCompLabels(person.roles);
              return (
              <div
                key={person.personKey}
                className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-4 space-y-3"
              >
                <div>
                  <p className="font-medium text-white">
                    {person.firstName} {person.lastName}
                  </p>
                  <p className="mt-2 text-sm text-neutral-300">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Competing in:{" "}
                    </span>
                    {compLabels.join(", ")}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">
                    Bib #
                  </label>
                  {renderBibField(person)}
                </div>
              </div>
              );
            })}
          </div>

          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-neutral-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Competing in</th>
                  <th className="py-2">Bib #</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((person) => (
                  <tr key={person.personKey} className="border-t border-neutral-800">
                    <td className="py-2.5 pr-4 text-white">
                      {person.firstName} {person.lastName}
                    </td>
                    <td className="py-2.5 pr-4 text-neutral-300">
                      {formatRegistrantCompLabels(person.roles).join(", ")}
                    </td>
                    <td className="py-2.5">{renderBibField(person)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {duplicateNumbers.size > 0 && (
            <p className="mt-4 text-sm text-red-300">
              Duplicate bib numbers: {[...duplicateNumbers].join(", ")}
            </p>
          )}
        </>
      )}
    </main>
  );
}
