/**
 * Geocode US location to lat/lng using Nominatim (OpenStreetMap).
 * Free, no API key. Use sparingly (e.g. on profile save); Nominatim rate limit ~1 req/sec.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CountryCitySwing/1.0 (profile location)";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
}

/**
 * Geocode by US zip code and optional state name.
 * Returns null if not found or on error.
 */
export async function geocodeUsZip(
  zipCode: string,
  stateName?: string | null
): Promise<GeocodeResult | null> {
  const trimmed = (zipCode || "").trim();
  if (!trimmed) return null;

  const query = stateName
    ? `${trimmed}, ${stateName.trim()}, USA`
    : `${trimmed}, USA`;

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    countrycodes: "us",
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { latitude: lat, longitude: lon };
  } catch {
    return null;
  }
}
