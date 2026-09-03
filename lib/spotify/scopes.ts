export const DJ_DECK_REQUIRED_SCOPES = [
  "streaming",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-playback-state",
] as const;

export function parseGrantedScopes(granted: string | null | undefined): Set<string> {
  if (!granted?.trim()) return new Set();
  return new Set(
    granted
      .trim()
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function missingScopes(granted: string | null | undefined): string[] {
  const have = parseGrantedScopes(granted);
  return DJ_DECK_REQUIRED_SCOPES.filter((scope) => !have.has(scope));
}

export function needsDeckReconnect(granted: string | null | undefined): boolean {
  return missingScopes(granted).length > 0;
}
