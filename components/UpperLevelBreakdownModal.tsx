"use client";

import {
  DANCE_ROLE_LABELS,
  type DanceRole,
  type UpperLevelBreakdown,
} from "@/lib/upperLevelRegistration";
import { plannedClassLevelModalClass } from "@/lib/classLevels";

function formatCap(count: number, capacity: number | null): string {
  if (capacity == null) return String(count);
  return `${count} / ${capacity}`;
}

function RosterList({
  entries,
}: {
  entries: UpperLevelBreakdown["public"]["lead"]["roster"];
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-gray-500 italic">None</p>;
  }
  return (
    <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800/80 px-2.5 py-1.5 text-sm"
        >
          <span className="text-white min-w-0 truncate">
            {entry.first_name} {entry.last_name}
          </span>
          <span
            className={`text-xs shrink-0 ${
              entry.checked_in ? "text-green-400" : "text-gray-500"
            }`}
          >
            {entry.checked_in ? "In" : "Out"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RoleSection({
  title,
  breakdown,
  capacities,
  showCapacity,
}: {
  title: string;
  breakdown: UpperLevelBreakdown["public"];
  capacities: UpperLevelBreakdown["capacities"];
  showCapacity: boolean;
}) {
  const roles: DanceRole[] = ["lead", "follow"];
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      {roles.map((role) => {
        const counts = breakdown[role];
        const capacity =
          role === "lead"
            ? capacities.upper_level_lead_capacity
            : capacities.upper_level_follow_capacity;
        return (
          <div key={role} className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-gray-200">
                {DANCE_ROLE_LABELS[role]}
              </span>
              <span className="text-sm tabular-nums text-gray-300">
                {showCapacity ? formatCap(counts.total, capacity) : counts.total} signed up
                <span className="text-gray-500 font-normal">
                  {" "}
                  · {counts.checked_in} checked in
                </span>
              </span>
            </div>
            <RosterList entries={counts.roster} />
          </div>
        );
      })}
    </div>
  );
}

export default function UpperLevelBreakdownModal({
  breakdown,
  onClose,
}: {
  breakdown: UpperLevelBreakdown;
  onClose: () => void;
}) {
  const ccsTotal =
    breakdown.ccsTeam.lead.total + breakdown.ccsTeam.follow.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        className={`w-full max-w-lg rounded-xl border-2 p-5 shadow-xl max-h-[90vh] overflow-y-auto ${plannedClassLevelModalClass("upper_level")}`}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Upper Level</h3>
            <p className="text-sm text-gray-400 tabular-nums">
              {breakdown.public.lead.total + breakdown.public.follow.total} toward limit
              {ccsTotal > 0 ? ` · ${ccsTotal} CCS Team` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white shrink-0"
          >
            Close
          </button>
        </div>

        <RoleSection
          title="Public registrations (toward limit)"
          breakdown={breakdown.public}
          capacities={breakdown.capacities}
          showCapacity
        />

        <div className="my-4 border-t border-neutral-700" />

        <RoleSection
          title="CCS Team"
          breakdown={breakdown.ccsTeam}
          capacities={breakdown.capacities}
          showCapacity={false}
        />

        <div className="my-4 border-t border-neutral-700" />

        <div className="rounded-lg border border-neutral-600 bg-neutral-800/60 p-3">
          <h4 className="text-sm font-semibold text-white mb-2">Totals (all Upper Level)</h4>
          <div className="grid grid-cols-2 gap-2 text-sm tabular-nums text-gray-300">
            <div>
              Leads: {breakdown.totals.lead.total}
              <span className="text-gray-500"> · {breakdown.totals.lead.checked_in} in</span>
            </div>
            <div>
              Follows: {breakdown.totals.follow.total}
              <span className="text-gray-500"> · {breakdown.totals.follow.checked_in} in</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
