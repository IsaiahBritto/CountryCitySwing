"use client";

import { useEffect } from "react";
import CompLevelBadge from "@/components/CompLevelBadge";
import type { CompDivisionSummary } from "@/lib/compRegistrationCounts";

export type CompDivisionModalKind = "strictly" | "jnj";

export default function CompDivisionRegistrationModal({
  division,
  level,
  summary,
  onClose,
}: {
  division: CompDivisionModalKind;
  level: string | null | undefined;
  summary: CompDivisionSummary;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = division === "strictly" ? "Strictly" : "Jack & Jill";
  const couples = summary.strictly.couples;
  const { total, lead, follow } = summary.jnj;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comp-division-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border-2 border-neutral-600 bg-neutral-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3
              id="comp-division-modal-title"
              className="text-lg font-semibold text-white flex flex-wrap items-center gap-2"
            >
              {title}
              <CompLevelBadge level={level} />
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Full event registration counts (not affected by check-in filters).
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

        {division === "strictly" ? (
          <p className="text-2xl font-semibold text-white tabular-nums">
            {couples}{" "}
            <span className="text-base font-normal text-gray-300">
              couple{couples === 1 ? "" : "s"} registered
            </span>
          </p>
        ) : (
          <dl className="space-y-3">
            <div className="flex items-baseline justify-between gap-4 rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-3">
              <dt className="text-sm text-gray-300">Total registered</dt>
              <dd className="text-xl font-semibold text-white tabular-nums">
                {total}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-3">
              <dt className="text-sm text-gray-300">Leads</dt>
              <dd className="text-xl font-semibold text-white tabular-nums">
                {lead}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-3">
              <dt className="text-sm text-gray-300">Follows</dt>
              <dd className="text-xl font-semibold text-white tabular-nums">
                {follow}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
