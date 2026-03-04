import * as topojson from "topojson-client";
import type { FeatureCollection } from "geojson";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const COUNTIES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

/**
 * Fetch US states TopoJSON and return as GeoJSON FeatureCollection.
 * Call from server only (e.g. in Instructors page) so the client doesn't need to hit the CDN.
 */
export async function getUsStatesGeography(): Promise<FeatureCollection | null> {
  try {
    const res = await fetch(STATES_URL, {
      headers: { "User-Agent": "CountryCitySwing/1.0 (server)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const topology = (await res.json()) as { objects?: { states?: unknown } };
    const states = topology?.objects?.states;
    if (!states || !topology) return null;
    const fc = (topojson.feature as (t: unknown, o: unknown) => FeatureCollection)(
      topology,
      states
    );
    return fc;
  } catch {
    return null;
  }
}

/**
 * Fetch US counties TopoJSON and return as GeoJSON FeatureCollection.
 * County feature id is 5-digit FIPS (state FIPS * 1000 + county FIPS).
 * Call from server only.
 */
export async function getUsCountiesGeography(): Promise<FeatureCollection | null> {
  try {
    const res = await fetch(COUNTIES_URL, {
      headers: { "User-Agent": "CountryCitySwing/1.0 (server)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const topology = (await res.json()) as { objects?: { counties?: unknown } };
    const counties = topology?.objects?.counties;
    if (!counties || !topology) return null;
    const fc = (topojson.feature as (t: unknown, o: unknown) => FeatureCollection)(
      topology,
      counties
    );
    return fc;
  } catch {
    return null;
  }
}
