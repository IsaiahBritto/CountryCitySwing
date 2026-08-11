"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch } from "@/lib/comps/clientAuth";
import { compBtnOutline } from "@/lib/comps/buttonStyles";
import {
  groupJudgeRoundSlots,
  type JudgeRoundRow,
} from "@/lib/comps/judgeRoundSlots";
import type { MeCompStaffEvent } from "@/lib/comps/compAccessClient";
import type { ScoringScope } from "@/lib/comps/types";

export default function RoleCards() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [staffEvents, setStaffEvents] = useState<MeCompStaffEvent[]>([]);
  const [judgeReadyCount, setJudgeReadyCount] = useState<number | null>(null);
  const [hasJudgeAssignment, setHasJudgeAssignment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        if (!cancelled) {
          setIsAdmin(false);
          setStaffEvents([]);
          setHasJudgeAssignment(false);
          setJudgeReadyCount(null);
        }
        return;
      }

      const [meRes, judgeRes] = await Promise.all([
        fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        authedFetch("/api/judge/rounds"),
      ]);

      if (cancelled) return;

      if (meRes.ok) {
        const me = await meRes.json();
        const role = (me.profile?.role || "").toLowerCase();
        setIsAdmin(role === "admin");
        setStaffEvents(me.comp_staff_events ?? []);
      } else {
        setIsAdmin(false);
        setStaffEvents([]);
      }

      if (judgeRes.ok) {
        const data = await judgeRes.json();
        const assignments = data.assignments ?? [];
        setHasJudgeAssignment(assignments.length > 0);
        let ready = 0;
        for (const a of assignments) {
          const slots = groupJudgeRoundSlots(
            (a.rounds ?? []) as JudgeRoundRow[],
            (a.scoringScope ?? "both") as ScoringScope
          );
          ready += slots.filter((s) => s.readyToJudge).length;
        }
        setJudgeReadyCount(ready);
      } else {
        setHasJudgeAssignment(false);
        setJudgeReadyCount(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin && !hasJudgeAssignment && staffEvents.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        For staff
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {staffEvents.length > 0 && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
            <div className="font-semibold text-white">Comp event ops</div>
            <p className="mt-1 text-sm text-neutral-400">
              Assign bibs and run check-in for{" "}
              {staffEvents.length === 1
                ? staffEvents[0].title
                : `${staffEvents.length} events`}
            </p>
            {staffEvents.length === 1 ? (
              <Link
                href={`/admin/comps/events/${staffEvents[0].id}/ops`}
                className={`mt-3 inline-flex ${compBtnOutline}`}
              >
                Open event ops
              </Link>
            ) : (
              <ul className="mt-3 space-y-2">
                {staffEvents.map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href={`/admin/comps/events/${ev.id}/ops`}
                      className="text-sm text-primary hover:underline"
                    >
                      {ev.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {hasJudgeAssignment && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
            <div className="font-semibold text-white">Judge portal</div>
            <p className="mt-1 text-sm text-neutral-400">
              {judgeReadyCount != null && judgeReadyCount > 0
                ? `${judgeReadyCount} round${judgeReadyCount === 1 ? "" : "s"} ready to judge`
                : "Open your scoring sheets"}
            </p>
            <Link href="/judge" className={`mt-3 inline-flex ${compBtnOutline}`}>
              Go to judging
            </Link>
          </div>
        )}
        {isAdmin && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
            <div className="font-semibold text-white">Run comps</div>
            <p className="mt-1 text-sm text-neutral-400">
              Admin console for entries, rounds, and publishing
            </p>
            <Link
              href="/admin/comps"
              className={`mt-3 inline-flex ${compBtnOutline}`}
            >
              Open admin
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
