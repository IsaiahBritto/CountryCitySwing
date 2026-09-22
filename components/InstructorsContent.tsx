"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { nameToSlug } from "@/lib/utils/slugHelpers";
import InstructorMapSection from "@/components/InstructorMapSection";
import type { InstructorForMap } from "@/components/InstructorMap";
import type { FeatureCollection } from "geojson";

export type InstructorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  specialty: string | null;
  role: string | null;
  accepting_new_students: boolean;
};

interface InstructorsContentProps {
  byState: { state: string; instructors: InstructorRow[] }[];
  instructorsForMap: InstructorForMap[];
  statesWithInstructors: string[];
  initialGeography: FeatureCollection | null | undefined;
  initialCountiesGeography: FeatureCollection | null | undefined;
}

function filterInstructorRow(
  row: InstructorRow,
  filterAcceptingOnly: boolean
): boolean {
  if (!filterAcceptingOnly) return true;
  return row.accepting_new_students;
}

export default function InstructorsContent({
  byState,
  instructorsForMap,
  statesWithInstructors,
  initialGeography,
  initialCountiesGeography,
}: InstructorsContentProps) {
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [filterAcceptingOnly, setFilterAcceptingOnly] = useState(false);

  const acceptingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of byState) {
      for (const inst of group.instructors) {
        if (inst.accepting_new_students) ids.add(inst.id);
      }
    }
    return ids;
  }, [byState]);

  const filteredByState = useMemo(() => {
    if (!filterAcceptingOnly) return byState;
    return byState
      .map(({ state, instructors }) => ({
        state,
        instructors: instructors.filter((i) => filterInstructorRow(i, true)),
      }))
      .filter((g) => g.instructors.length > 0);
  }, [byState, filterAcceptingOnly]);

  const filteredInstructorsForMap = useMemo(() => {
    if (!filterAcceptingOnly) return instructorsForMap;
    return instructorsForMap.filter((m) => acceptingIds.has(m.id));
  }, [instructorsForMap, filterAcceptingOnly, acceptingIds]);

  const filteredStatesWithInstructors = useMemo(() => {
    if (!filterAcceptingOnly) return statesWithInstructors;
    const states = new Set(
      filteredInstructorsForMap
        .map((m) => (m.state ?? "").trim())
        .filter(Boolean)
    );
    return [...states].sort();
  }, [
    statesWithInstructors,
    filterAcceptingOnly,
    filteredInstructorsForMap,
  ]);

  const toggleState = (state: string) => {
    setExpandedStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  };

  const handleInstructorClickFromMap = useCallback((id: string, state: string) => {
    setExpandedStates((prev) => new Set([...prev, state]));
    setTimeout(() => {
      document.getElementById(`instructor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, []);

  const instructorList = filteredByState.flatMap((g) =>
    g.instructors.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
    }))
  );

  const totalInDirectory = byState.reduce((n, g) => n + g.instructors.length, 0);
  const totalAfterFilter = filteredByState.reduce(
    (n, g) => n + g.instructors.length,
    0
  );

  return (
    <>
      <div className="flex flex-col items-center gap-3 mb-8">
        <button
          type="button"
          aria-pressed={filterAcceptingOnly}
          onClick={() => setFilterAcceptingOnly((v) => !v)}
          className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition-all duration-300 ${
            filterAcceptingOnly
              ? "bg-yellow-400 text-black border-yellow-400 shadow-[0_0_16px_rgba(242,201,76,0.35)]"
              : "bg-neutral-800/80 text-neutral-200 border-neutral-600 hover:border-primary/60 hover:text-primary"
          }`}
        >
          {filterAcceptingOnly
            ? "Accepting new students only"
            : "Show only instructors accepting new students"}
        </button>
        {filterAcceptingOnly && totalAfterFilter === 0 && totalInDirectory > 0 && (
          <p className="text-center text-neutral-500 text-sm max-w-md">
            No instructors are marked as accepting new students yet. Check back
            soon or turn off the filter to see everyone in the directory.
          </p>
        )}
      </div>

      <InstructorMapSection
        instructorsForMap={filteredInstructorsForMap}
        instructorList={instructorList}
        statesWithInstructors={filteredStatesWithInstructors}
        initialGeography={initialGeography}
        initialCountiesGeography={initialCountiesGeography}
        onInstructorClick={handleInstructorClickFromMap}
      />

      {filteredByState.length === 0 ? (
        <p className="text-center text-neutral-500">
          {filterAcceptingOnly
            ? "No instructors match this filter."
            : "No instructors in the directory yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredByState.map(({ state, instructors }) => {
            const isExpanded = expandedStates.has(state);
            return (
              <div
                key={state}
                className="rounded-xl border border-neutral-700 bg-neutral-800/50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleState(state)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-neutral-700/40 transition-colors"
                  aria-expanded={isExpanded}
                >
                  <span className="text-lg font-bold text-primary">{state}</span>
                  <span className="text-neutral-400 text-sm">
                    {instructors.length} instructor{instructors.length !== 1 ? "s" : ""}
                  </span>
                  <svg
                    className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="border-t border-neutral-700">
                    <ul className="divide-y divide-neutral-700">
                      {instructors.map((member) => (
                        <li key={member.id} id={`instructor-${member.id}`} className="scroll-mt-24">
                          <InstructorListItem member={member} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function InstructorListItem({ member }: { member: InstructorRow }) {
  const slug = nameToSlug(member.first_name ?? "", member.last_name ?? "");
  const isCore = (member.role ?? "").toLowerCase() === "admin" || (member.role ?? "").toLowerCase() === "instructor";
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ");
  return (
    <Link
      href={`/instructors/${encodeURIComponent(slug)}`}
      className={`flex items-center gap-4 px-5 py-4 transition-colors group ${isCore ? "bg-yellow-500/15 hover:bg-yellow-500/25" : "hover:bg-neutral-700/30"}`}
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 border-primary/50 bg-neutral-700">
        {member.photo_url ? (
          <img
            src={member.photo_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary text-sm font-semibold">
            {(member.first_name?.[0] ?? "") + (member.last_name?.[0] ?? "")}
          </div>
        )}
      </div>
      <div className="flex-grow min-w-0">
        <p className="font-semibold text-neutral-100 group-hover:text-primary transition-colors truncate">
          {name || "Instructor"}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {member.specialty && (
            <span className="text-xs text-primary/90">{member.specialty}</span>
          )}
          {isCore && (
            <span className="text-xs text-neutral-500">CCS Team</span>
          )}
          {member.accepting_new_students && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400/95 border border-yellow-400/30">
              Accepting students
            </span>
          )}
        </div>
      </div>
      <span className="flex-shrink-0 text-sm text-primary font-medium group-hover:underline">
        See Profile →
      </span>
    </Link>
  );
}
