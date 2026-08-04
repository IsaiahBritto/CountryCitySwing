"use client";

import Link from "next/link";
import {
  COMP_TYPE_LABEL,
  ordinalLabel,
  type MeCompHistory,
  type MePayload,
} from "@/lib/comps/hubTypes";

function divisionLabel(d: "strictly" | "jack_and_jill"): string {
  return COMP_TYPE_LABEL[d] ?? d;
}

function roleLabel(role: "lead" | "follow" | null): string {
  if (role === "lead") return "Lead";
  if (role === "follow") return "Follow";
  return "";
}

function historyHref(competitionId: string, compLinkBase?: string): string {
  if (compLinkBase) return `${compLinkBase}${competitionId}`;
  return `/comps/me?comp=${competitionId}`;
}

function HistoryCard({
  row,
  compLinkBase,
  highlightCompId,
}: {
  row: MeCompHistory;
  compLinkBase?: string;
  highlightCompId?: string | null;
}) {
  const highlighted = highlightCompId === row.competitionId;

  return (
    <Link
      id={`comp-${row.competitionId}`}
      href={historyHref(row.competitionId, compLinkBase)}
      className={
        "block rounded-xl border bg-neutral-800/50 p-4 transition hover:border-primary/50 " +
        (highlighted
          ? "border-primary ring-2 ring-primary/40"
          : "border-neutral-700")
      }
    >
      {row.placement != null ? (
        <div className="font-semibold text-primary">
          {ordinalLabel(row.placement)} place
        </div>
      ) : (
        <div className="font-semibold text-neutral-300">Competed</div>
      )}
      <div className="text-sm text-white">{row.competitionName}</div>
      <div className="text-sm text-neutral-400">
        {COMP_TYPE_LABEL[row.compType] ?? row.compType}
        {row.role ? ` · ${roleLabel(row.role)}` : ""}
        {row.eventTitle ? ` · ${row.eventTitle}` : ""}
        {row.eventStartsAt &&
          ` · ${new Date(row.eventStartsAt).toLocaleDateString()}`}
      </div>
    </Link>
  );
}

export default function MyCompsSection({
  me,
  historyLimit,
  viewAllHref,
  compLinkBase = "/comps/me?comp=",
  highlightCompId,
  showUpcoming = true,
  showHistoryHeading = true,
}: {
  me: MePayload | null;
  /** Max history rows on hub; omit for full list on /comps/me */
  historyLimit?: number;
  viewAllHref?: string;
  compLinkBase?: string;
  highlightCompId?: string | null;
  showUpcoming?: boolean;
  showHistoryHeading?: boolean;
}) {
  if (!me) return null;
  if (
    me.upcoming.length === 0 &&
    me.history.length === 0
  ) {
    return null;
  }

  const historyRows =
    historyLimit != null ? me.history.slice(0, historyLimit) : me.history;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        My comps
      </h2>
      <div className="space-y-3">
        {showUpcoming &&
          me.upcoming.map((u) => (
            <div
              key={u.signupId}
              className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4"
            >
              <div className="font-semibold text-white">
                {u.event?.title ?? "Upcoming comp"}
              </div>
              <div className="mt-1 text-sm text-neutral-400">
                {u.event?.starts_at &&
                  new Date(u.event.starts_at).toLocaleDateString()}
                {u.bibNumber != null && (
                  <span className="ml-2 font-mono text-primary">
                    Bib {u.bibNumber}
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-neutral-300">
                {u.divisions.map((d, i) => (
                  <li key={`${d.division}-${i}`}>
                    Registered — {divisionLabel(d.division)}
                    {d.role ? `, ${roleLabel(d.role)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {historyRows.length > 0 && showHistoryHeading && me.upcoming.length > 0 && (
          <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Competed
          </h3>
        )}

        {historyRows.map((row) => (
          <HistoryCard
            key={`${row.competitionId}-${row.role ?? "x"}`}
            row={row}
            compLinkBase={compLinkBase}
            highlightCompId={highlightCompId}
          />
        ))}

        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            View all my comps →
          </Link>
        )}
      </div>
    </section>
  );
}
