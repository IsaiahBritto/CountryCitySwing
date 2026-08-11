"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline, compBtnSecondary } from "@/lib/comps/buttonStyles";
import type { StaffSearchScope } from "@/lib/compStaffProfileSearch";

interface StaffMember {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
}

interface SearchProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
}

export default function EventStaffSection({ eventId }: { eventId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [scope, setScope] = useState<StaffSearchScope>("ccs_team");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStaff = useCallback(async () => {
    const res = await authedFetch(`/api/admin/comps/events/${eventId}/staff`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setStaff(data.staff ?? []);
  }, [eventId]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await authedFetch(
        `/api/admin/comps/events/${eventId}/staff?q=${encodeURIComponent(query.trim())}&scope=${scope}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.profiles ?? []);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, scope, eventId]);

  const addStaff = async (profileId: string) => {
    setBusy(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/events/${eventId}/staff`, {
      method: "POST",
      body: JSON.stringify({ profile_id: profileId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setStaff(data.staff ?? []);
    setQuery("");
    setResults([]);
  };

  const removeStaff = async (profileId: string) => {
    setBusy(true);
    setError(null);
    const res = await authedFetch(
      `/api/admin/comps/events/${eventId}/staff?profile_id=${profileId}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setStaff(data.staff ?? []);
  };

  const inputCls =
    "rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white";

  return (
    <section className="mb-8 rounded-xl border border-neutral-700 bg-neutral-800/40 p-4">
      <h2 className="mb-1 text-lg font-semibold text-white">Event staff</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Assign people who can assign bib numbers and run check-in for this event
        only.
      </p>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {(["ccs_team", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={
              "rounded-md px-3 py-1.5 text-sm min-h-11 " +
              (scope === s ? compBtnOutline : compBtnSecondary)
            }
          >
            {s === "ccs_team" ? "CCS Team" : "Any account"}
          </button>
        ))}
      </div>

      <input
        className={inputCls + " mb-2 w-full max-w-md"}
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {results.length > 0 && (
        <ul className="mb-4 max-w-md rounded-md border border-neutral-700 bg-neutral-900/80">
          {results.map((p) => (
            <li key={p.id} className="border-t border-neutral-800 first:border-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => addStaff(p.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
              >
                <span className="text-white">
                  {p.first_name} {p.last_name}
                  {p.email && (
                    <span className="ml-2 text-neutral-500">{p.email}</span>
                  )}
                </span>
                <span className="text-primary">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {staff.length === 0 ? (
        <p className="text-sm text-neutral-500">No staff assigned yet.</p>
      ) : (
        <ul className="space-y-2">
          {staff.map((s) => (
            <li
              key={s.profile_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-700/80 px-3 py-2"
            >
              <div>
                <span className="text-white">
                  {s.first_name} {s.last_name}
                </span>
                {s.email && (
                  <span className="ml-2 text-sm text-neutral-500">{s.email}</span>
                )}
                {s.role && (
                  <span className="ml-2 text-xs text-neutral-400">({s.role})</span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => removeStaff(s.profile_id)}
                className="text-sm text-red-300 hover:text-red-200"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
