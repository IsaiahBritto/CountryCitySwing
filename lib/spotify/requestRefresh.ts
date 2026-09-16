export const REQUEST_REFRESH_OPTIONS = [15, 30, 45, 60] as const;

export type RequestRefreshMinutes = (typeof REQUEST_REFRESH_OPTIONS)[number];

export const DEFAULT_REQUEST_REFRESH_MINUTES: RequestRefreshMinutes = 30;

export function parseRequestRefreshMinutes(
  raw: unknown
): RequestRefreshMinutes | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (!(REQUEST_REFRESH_OPTIONS as readonly number[]).includes(raw)) return null;
  return raw as RequestRefreshMinutes;
}

export function validateRequestRefreshMinutes(
  raw: unknown
): RequestRefreshMinutes {
  const parsed = parseRequestRefreshMinutes(raw);
  if (!parsed) {
    throw new Error("Request refresh interval must be 15, 30, 45, or 60 minutes");
  }
  return parsed;
}

export function rollingWindowCutoffIso(
  nowMs: number,
  refreshMinutes: number
): string {
  return new Date(nowMs - refreshMinutes * 60 * 1000).toISOString();
}

export function requestExpiresAtIso(
  createdAtIso: string,
  refreshMinutes: number
): string {
  const expiresMs =
    new Date(createdAtIso).getTime() + refreshMinutes * 60 * 1000;
  return new Date(expiresMs).toISOString();
}
