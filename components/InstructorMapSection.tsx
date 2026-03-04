"use client";

import { useState, useMemo } from "react";
import InstructorMap from "@/components/InstructorMap";
import type { InstructorForMap } from "@/components/InstructorMap";
import type { FeatureCollection } from "geojson";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { US_STATE_NAME_TO_FIPS } from "@/lib/utils/usStates";

type InstructorListItem = { id: string; first_name: string | null; last_name: string | null };

function getStateFipsFromCountyId(id: number | string | undefined): number | null {
  if (id == null) return null;
  const n = typeof id === "number" ? id : parseInt(String(id), 10);
  if (Number.isNaN(n)) return null;
  return Math.floor(n / 1000);
}

function getCountyId(geo: { id?: number | string; properties?: Record<string, unknown> }): number | null {
  const raw = geo.id ?? geo.properties?.GEOID ?? geo.properties?.COUNTY;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isNaN(n)) return n;
  const state = geo.properties?.STATEFP;
  const county = geo.properties?.COUNTYFP;
  if (state != null && county != null) {
    const s = typeof state === "number" ? state : parseInt(String(state), 10);
    const c = typeof county === "number" ? county : parseInt(String(county), 10);
    if (!Number.isNaN(s) && !Number.isNaN(c)) return s * 1000 + c;
  }
  return null;
}

interface InstructorMapSectionProps {
  instructorsForMap: InstructorForMap[];
  /** Flat list of all instructors (for display names and scroll target ids). */
  instructorList: InstructorListItem[];
  statesWithInstructors: string[];
  initialGeography: FeatureCollection | null | undefined;
  initialCountiesGeography: FeatureCollection | null | undefined;
  /** When user clicks an instructor in the list, call with (id, state) so parent can expand section and scroll. */
  onInstructorClick?: (instructorId: string, state: string) => void;
}

export default function InstructorMapSection({
  instructorsForMap,
  instructorList,
  statesWithInstructors,
  initialGeography,
  initialCountiesGeography,
  onInstructorClick,
}: InstructorMapSectionProps) {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<number | null>(null);

  const stateFips = useMemo(() => {
    if (!selectedState) return null;
    const key = selectedState.trim();
    return US_STATE_NAME_TO_FIPS[key] ?? US_STATE_NAME_TO_FIPS[key.toLowerCase()] ?? null;
  }, [selectedState]);

  const countiesForState = useMemo((): FeatureCollection | null => {
    if (!selectedState || !initialCountiesGeography?.features?.length || stateFips == null)
      return null;
    const features = initialCountiesGeography.features.filter((f) => {
      let sf = getStateFipsFromCountyId(f.id);
      if (sf == null) {
        const props = f.properties as Record<string, unknown> | undefined;
        const raw = props?.STATEFP;
        sf = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : null;
      }
      return sf != null && !Number.isNaN(sf) && sf === stateFips;
    });
    return features.length ? { type: "FeatureCollection", features } : null;
  }, [selectedState, initialCountiesGeography, stateFips]);

  /** Instructors to show in the list: in selected state, and in selected county if one is chosen. */
  const listInstructors = useMemo((): InstructorListItem[] => {
    if (!selectedState) return [];
    const stateLower = selectedState.trim().toLowerCase();
    const inState = instructorList.filter(
      (inst) => (instructorsForMap.find((m) => m.id === inst.id)?.state ?? "").trim().toLowerCase() === stateLower
    );
    if (!selectedCounty || !countiesForState?.features?.length) return inState;
    const countyFeature = countiesForState.features.find(
      (f) => getCountyId(f as { id?: number | string; properties?: Record<string, unknown> }) === selectedCounty
    ) as Feature<Polygon | MultiPolygon> | undefined;
    if (!countyFeature?.geometry) return inState;
    const withCoords = instructorsForMap.filter(
      (m) => m.state?.trim().toLowerCase() === stateLower && m.latitude != null && m.longitude != null
    );
    const idsInCounty = new Set(
      withCoords.filter((m) => booleanPointInPolygon(point([m.longitude!, m.latitude!]), countyFeature)).map((m) => m.id)
    );
    return inState.filter((inst) => idsInCounty.has(inst.id));
  }, [selectedState, selectedCounty, instructorList, instructorsForMap, countiesForState]);

  const handleListClick = (id: string) => {
    if (selectedState && onInstructorClick) {
      onInstructorClick(id, selectedState);
    } else {
      document.getElementById(`instructor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mb-14">
      <InstructorMap
        instructors={instructorsForMap}
        statesWithInstructors={statesWithInstructors}
        initialGeography={initialGeography}
        initialCountiesGeography={initialCountiesGeography}
        onStateSelect={(state) => {
          setSelectedState(state);
          setSelectedCounty(null);
        }}
        onCountySelect={setSelectedCounty}
      />
      {selectedState && (
        <div className="mt-6 rounded-xl border border-neutral-700 bg-neutral-800/50 p-6">
          <h3 className="text-lg font-semibold text-primary mb-3">
            {selectedCounty != null
              ? `Instructors in selected area — ${selectedState}`
              : `Instructors in ${selectedState}`}
          </h3>
          {listInstructors.length > 0 ? (
            <ul className="space-y-2">
              {listInstructors.map((inst) => (
                <li key={inst.id}>
                  <button
                    type="button"
                    onClick={() => handleListClick(inst.id)}
                    className="text-left w-full px-3 py-2 rounded-lg text-neutral-200 hover:bg-neutral-700/50 hover:text-primary transition-colors"
                  >
                    {[inst.first_name, inst.last_name].filter(Boolean).join(" ")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-neutral-500 text-sm">
              {selectedCounty != null ? "No instructors in this area." : "No instructors in this state."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
