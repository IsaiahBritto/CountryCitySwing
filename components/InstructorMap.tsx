"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import * as topojson from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { US_STATE_CENTERS, US_STATE_FIPS_TO_NAME, US_STATE_NAME_TO_FIPS } from "@/lib/utils/usStates";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const DEFAULT_CENTER: [number, number] = [-96, 37.5];
const DEFAULT_ZOOM = 1;
/** Zoom when a state is selected: full US visible, selected state as large as possible to see counties. */
const STATE_ZOOM = 2.25;

export interface InstructorForMap {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  specialty: string | null;
}

interface InstructorMapProps {
  instructors: InstructorForMap[];
  statesWithInstructors: string[];
  /** When provided, map uses this instead of fetching from CDN (avoids CORS/CSP issues). */
  initialGeography?: FeatureCollection | null;
  /** Counties geography for state drill-down (sub-state view). */
  initialCountiesGeography?: FeatureCollection | null;
  /** Called when user clicks a state (or reset). */
  onStateSelect?: (stateName: string | null) => void;
  /** Called when user clicks a county in the selected state (or when state is cleared). */
  onCountySelect?: (countyId: number | null) => void;
}

function getStateName(geo: { properties?: { name?: string }; id?: number | string }): string | null {
  const name = geo.properties?.name;
  if (typeof name === "string") return name;
  const id = geo.id;
  if (id == null) return null;
  const idNum = typeof id === "number" ? id : parseInt(String(id), 10);
  if (!Number.isNaN(idNum) && US_STATE_FIPS_TO_NAME[idNum])
    return US_STATE_FIPS_TO_NAME[idNum];
  return null;
}

/** Get state FIPS from county feature id (5-digit FIPS: state*1000 + county). */
function getStateFipsFromCountyId(id: number | string | undefined): number | null {
  if (id == null) return null;
  const n = typeof id === "number" ? id : parseInt(String(id), 10);
  if (Number.isNaN(n)) return null;
  return Math.floor(n / 1000);
}

/** Get numeric 5-digit county FIPS from a geography feature (us-atlas uses id or properties.GEOID). */
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

export default function InstructorMap({
  instructors,
  statesWithInstructors,
  initialGeography,
  initialCountiesGeography,
  onStateSelect,
  onCountySelect,
}: InstructorMapProps) {
  const [geography, setGeography] = useState<FeatureCollection | null>(
    initialGeography ?? null
  );
  const [mounted, setMounted] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (initialGeography != null) return;
    let cancelled = false;
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((topology: { objects?: { states?: unknown } }) => {
        if (cancelled) return;
        const states = topology?.objects?.states;
        if (states && topology) {
          const fc = (topojson.feature as (t: unknown, o: unknown) => FeatureCollection)(
            topology,
            states
          );
          setGeography(fc);
        }
      })
      .catch(() => setGeography(null));
    return () => {
      cancelled = true;
    };
  }, [initialGeography]);

  const instructorsInState = useMemo(() => {
    if (!selectedState) return [];
    const sel = selectedState.trim().toLowerCase();
    return instructors.filter(
      (i) => (i.state ?? "").trim().toLowerCase() === sel
    );
  }, [instructors, selectedState]);

  const stateCenter = useMemo(() => {
    if (!selectedState) return null;
    const key = selectedState.trim();
    if (US_STATE_CENTERS[key]) return US_STATE_CENTERS[key];
    const lower = key.toLowerCase();
    const found = Object.keys(US_STATE_CENTERS).find(
      (k) => k.toLowerCase() === lower
    );
    return found ? US_STATE_CENTERS[found] : null;
  }, [selectedState]);

  const stateFips = useMemo(() => {
    if (!selectedState) return null;
    const key = selectedState.trim();
    return US_STATE_NAME_TO_FIPS[key] ?? US_STATE_NAME_TO_FIPS[key.toLowerCase()] ?? null;
  }, [selectedState]);

  /** Counties for the selected state only (for sub-state view). */
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
      if (sf == null && f.properties) {
        const geoid = (f.properties as Record<string, unknown>).GEOID;
        if (geoid != null) sf = parseInt(String(geoid).slice(0, 2), 10);
      }
      return sf != null && !Number.isNaN(sf) && sf === stateFips;
    });
    return features.length ? { type: "FeatureCollection", features } : null;
  }, [selectedState, initialCountiesGeography, stateFips]);

  /** County FIPS ids that contain at least one instructor (point-in-polygon). */
  const countiesWithInstructors = useMemo(() => {
    if (!countiesForState?.features?.length || !instructorsInState.length) return new Set<number>();
    const withCoords = instructorsInState.filter(
      (i) => i.latitude != null && i.longitude != null
    );
    if (!withCoords.length) return new Set<number>();
    const set = new Set<number>();
    for (const feature of countiesForState.features as Feature<Polygon | MultiPolygon>[]) {
      const idNum = getCountyId(feature as { id?: number | string; properties?: Record<string, unknown> });
      if (idNum == null || !feature.geometry) continue;
      for (const inst of withCoords) {
        const pt = point([inst.longitude!, inst.latitude!]);
        if (booleanPointInPolygon(pt, feature)) {
          set.add(idNum);
          break;
        }
      }
    }
    return set;
  }, [countiesForState, instructorsInState]);

  const handleMoveEnd = useCallback(({ coordinates, zoom: z }: { coordinates: [number, number]; zoom: number }) => {
    setCenter(coordinates);
    setZoom(z);
  }, []);

  const handleStateClick = (stateName: string | null) => {
    if (!stateName) return;
    const coords = US_STATE_CENTERS[stateName];
    if (coords && statesWithInstructors.includes(stateName)) {
      setSelectedState(stateName);
      setCenter([coords[0], coords[1]]);
      setZoom(STATE_ZOOM);
      onCountySelect?.(null);
      onStateSelect?.(stateName);
    }
  };

  const resetZoom = () => {
    setSelectedState(null);
    setCenter(DEFAULT_CENTER);
    setZoom(DEFAULT_ZOOM);
    onStateSelect?.(null);
    onCountySelect?.(null);
  };

  /** When a state is selected, geography for "other" states (excluding selected). */
  const otherStatesGeography = useMemo((): FeatureCollection | null => {
    if (!geography?.features?.length || !selectedState) return null;
    const other = geography.features.filter(
      (f) => getStateName(f as { properties?: { name?: string }; id?: number | string }) !== selectedState
    );
    return other.length ? { type: "FeatureCollection", features: other } : null;
  }, [geography, selectedState]);

  /** Map from county feature index to numeric county id (for reliable lookup when react-simple-maps strips id). */
  const countyIdByIndex = useMemo(() => {
    if (!countiesForState?.features?.length) return new Map<number, number>();
    const map = new Map<number, number>();
    countiesForState.features.forEach((f, i) => {
      const id = getCountyId(f as { id?: number | string; properties?: Record<string, unknown> });
      if (id != null) map.set(i, id);
    });
    return map;
  }, [countiesForState]);

  if (!geography) {
    return (
      <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center text-neutral-500">
        Loading map…
      </div>
    );
  }

  // Render a static placeholder until mounted so server and client HTML match (avoids hydration error).
  if (!mounted) {
    return (
      <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 bg-neutral-900/50">
          <p className="text-sm text-neutral-400">
            Click a highlighted state to zoom and see instructors
          </p>
        </div>
        <div className="h-[min(360px,50vh)] w-full bg-neutral-800/50" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 bg-neutral-900/50">
        <p className="text-sm text-neutral-400">
          {!selectedState
            ? "Click a highlighted state to see its counties; click a county to see instructors in that area"
            : `Instructors in ${selectedState} — see list below or click a shaded county`}
        </p>
        {selectedState && (
          <button
            type="button"
            onClick={resetZoom}
            className="text-sm text-primary hover:text-primary/80"
          >
            Reset zoom
          </button>
        )}
      </div>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 850 }}
        style={{ width: "100%", height: "min(360px, 50vh)" }}
      >
        {/* onMoveEnd is supported at runtime; types are incomplete in @types/react-simple-maps */}
        <ZoomableGroup
          center={center}
          zoom={zoom}
          minZoom={1}
          maxZoom={8}
          // @ts-expect-error ZoomableGroup supports onMoveEnd per react-simple-maps docs
          onMoveEnd={handleMoveEnd}
        >
          {/* When no state selected: all states. When selected: other states only (selected state drawn as counties below). */}
          <Geographies geography={selectedState && otherStatesGeography ? otherStatesGeography : geography}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const stateName = getStateName(geo);
                const stateNameLower = (stateName ?? "").trim().toLowerCase();
                const hasInstructors =
                  stateName != null &&
                  statesWithInstructors.some(
                    (s) => (s ?? "").trim().toLowerCase() === stateNameLower
                  );
                const isSelected = stateName === selectedState;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={hasInstructors ? (isSelected ? "#F2C94C" : "rgba(242,201,76,0.4)") : "#374151"}
                    stroke="#4b5563"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: hasInstructors
                        ? { fill: "#F2C94C", cursor: "pointer", outline: "none" }
                        : { outline: "none" },
                      pressed: { outline: "none" },
                    }}
                    onClick={() => handleStateClick(stateName)}
                  />
                );
              })
            }
          </Geographies>
          {/* When a state is selected, draw its counties on top (so they’re visible and clickable). */}
          {selectedState && countiesForState && (
            <Geographies geography={countiesForState}>
              {({ geographies }) =>
                geographies.map((geo, i) => {
                  const idNum = countyIdByIndex.get(i) ?? getCountyId(geo);
                  const hasInstructors = idNum != null && countiesWithInstructors.has(idNum);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={hasInstructors ? "rgba(242,201,76,0.6)" : "#374151"}
                      stroke="#6b7280"
                      strokeWidth={0.4}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: hasInstructors ? "rgba(242,201,76,0.85)" : "#4b5563", cursor: "pointer", outline: "none" },
                        pressed: { outline: "none" },
                      }}
                      onClick={() => {
                        if (idNum != null) onCountySelect?.(idNum);
                      }}
                    />
                  );
                })
              }
            </Geographies>
          )}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
