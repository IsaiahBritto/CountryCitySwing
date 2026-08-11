"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline } from "@/lib/comps/buttonStyles";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

interface CompEventInfo {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
  type?: string | null;
}

interface CompetitionListItem {
  id: string;
  name: string;
  comp_type: "jack_and_jill" | "strictly";
  status: string;
  cj_in_panel: boolean;
  test_comp?: boolean;
  event: CompEventInfo | null;
  entries: { count: number }[];
  judges: { count: number }[];
  rounds: { count: number }[];
}

interface CompEvent {
  id: string;
  title: string;
  starts_at: string;
}

interface EventCompGroup {
  eventId: string | null;
  event: CompEventInfo | null;
  competitions: CompetitionListItem[];
}

const TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

function groupCompetitionsByEvent(
  competitions: CompetitionListItem[]
): EventCompGroup[] {
  const byEvent = new Map<string, EventCompGroup>();

  for (const competition of competitions) {
    const key = competition.event?.id ?? "__none__";
    let group = byEvent.get(key);
    if (!group) {
      group = {
        eventId: competition.event?.id ?? null,
        event: competition.event,
        competitions: [],
      };
      byEvent.set(key, group);
    }
    group.competitions.push(competition);
  }

  return [...byEvent.values()]
    .sort((a, b) => {
      const aTime = a.event?.starts_at
        ? new Date(a.event.starts_at).getTime()
        : 0;
      const bTime = b.event?.starts_at
        ? new Date(b.event.starts_at).getTime()
        : 0;
      return bTime - aTime;
    })
    .map((group) => ({
      ...group,
      competitions: [...group.competitions].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
}

function eventScheduleLabel(event: CompEventInfo): string {
  return formatEventScheduleSubtitle(
    event.starts_at,
    event.ends_at,
    event.time_zone || DEFAULT_TIME_ZONE,
    event.type ?? "comp"
  );
}

export default function AdminCompsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [competitions, setCompetitions] = useState<CompetitionListItem[]>([]);
  const [events, setEvents] = useState<CompEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newEventId, setNewEventId] = useState("");
  const [newType, setNewType] = useState<"jack_and_jill" | "strictly">(
    "jack_and_jill"
  );
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const eventGroups = useMemo(
    () => groupCompetitionsByEvent(competitions),
    [competitions]
  );

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/comps");
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setCompetitions(data.competitions ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const me = res.ok ? await res.json() : null;
      const admin = (me?.profile?.role ?? "").toLowerCase() === "admin";
      setIsAdmin(admin);
      if (admin) {
        await load();
        const { data: eventRows } = await supabaseBrowser
          .from("events")
          .select("id, title, starts_at, type")
          .order("starts_at", { ascending: false })
          .limit(100);
        setEvents(
          (eventRows ?? [])
            .filter((e: any) => String(e.type ?? "").toLowerCase() === "comp")
            .map((e: any) => ({ id: e.id, title: e.title, starts_at: e.starts_at }))
        );
      }
      setLoading(false);
    })();
  }, [load]);

  const createCompetition = async () => {
    if (!newEventId || !newName.trim()) return;
    setCreating(true);
    setError(null);
    const res = await authedFetch("/api/admin/comps", {
      method: "POST",
      body: JSON.stringify({
        event_id: newEventId,
        comp_type: newType,
        name: newName.trim(),
      }),
    });
    setCreating(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setShowCreate(false);
    setNewName("");
    await load();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="text-center text-neutral-400">Checking access…</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">Access denied</h1>
        <p className="text-neutral-400">This page is for administrators only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/comps" className="text-sm text-neutral-400 hover:text-primary">
        ← Comps hub
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Competitions</h1>
          <p className="text-sm text-neutral-400">
            Scoring &amp; judging for Jack &amp; Jill and Strictly contests
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowCreate((v) => !v)} className={compBtnOutline}>
            New competition
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mb-6 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
          <h2 className="mb-3 font-semibold text-white">New competition</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={newEventId}
              onChange={(e) => setNewEventId(e.target.value)}
              className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
            >
              <option value="">Select comp event…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.starts_at).toLocaleDateString()}
                </option>
              ))}
            </select>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
            >
              <option value="jack_and_jill">Jack &amp; Jill</option>
              <option value="strictly">Strictly</option>
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder='Name (e.g. "Novice Jack & Jill")'
              className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={createCompetition}
              disabled={creating || !newEventId || !newName.trim()}
              className={compBtnOutline}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-md border border-neutral-600 px-4 py-2 text-sm text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {competitions.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">
          No competitions yet. Create one for a comp event to get started.
        </p>
      ) : (
        <div className="space-y-6">
          {eventGroups.map((group) => (
            <section
              key={group.eventId ?? "no-event"}
              className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-4"
            >
              <div className="mb-3 border-b border-neutral-700/80 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {group.event?.title ?? "No comp event linked"}
                    </h2>
                    {group.event?.starts_at && (
                      <p className="mt-0.5 text-sm text-neutral-400">
                        {eventScheduleLabel(group.event)}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">
                      {group.competitions.length} division
                      {group.competitions.length === 1 ? "" : "s"} · shared signup
                      registration
                    </p>
                  </div>
                  {group.eventId && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link
                        href={`/admin/comps/events/${group.eventId}/bibs`}
                        className={compBtnOutline + " text-sm"}
                      >
                        Assign bib numbers
                      </Link>
                      <Link
                        href={`/admin/comps/events/${group.eventId}/ops`}
                        className="rounded-md border border-neutral-600 px-4 py-2 text-sm text-neutral-200 hover:border-primary/60"
                      >
                        Staff ops
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {group.competitions.map((c) => (
                  <Link
                    key={c.id}
                    href={`/admin/comps/${c.id}`}
                    className="block rounded-lg border border-neutral-700/80 bg-neutral-800/50 p-4 transition hover:border-primary/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-white">
                          {c.name}
                          {c.test_comp && (
                            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                              Test
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-neutral-400">
                          {TYPE_LABEL[c.comp_type]}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-neutral-400">
                        <span>{c.entries?.[0]?.count ?? 0} entries</span>
                        <span>{c.judges?.[0]?.count ?? 0} judges</span>
                        <span>{c.rounds?.[0]?.count ?? 0} rounds</span>
                        <span
                          className={
                            "rounded px-2 py-0.5 text-xs font-semibold " +
                            (c.status === "completed"
                              ? "bg-neutral-600/40 text-neutral-300"
                              : c.status === "in_progress"
                                ? "bg-primary/20 text-primary"
                                : "bg-neutral-700/60 text-neutral-300")
                          }
                        >
                          {c.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
