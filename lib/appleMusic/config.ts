export function appleMusicTeamId(): string | null {
  const v = process.env.APPLE_MUSIC_TEAM_ID?.trim();
  return v || null;
}

export function appleMusicKeyId(): string | null {
  const v = process.env.APPLE_MUSIC_KEY_ID?.trim();
  return v || null;
}

export function normalizeApplePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("\\n")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return trimmed;
}

export function appleMusicPrivateKey(): string | null {
  const v = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!v?.trim()) return null;
  return normalizeApplePrivateKey(v);
}

export function appleMusicAppName(): string {
  return process.env.APPLE_MUSIC_APP_NAME?.trim() || "Country City Swing DJ Deck";
}

export function appleMusicAppBuild(): string {
  return process.env.APPLE_MUSIC_APP_BUILD?.trim() || "1.0.0";
}

/** Default max JWT lifetime (seconds). Apple allows up to ~6 months; we cache below this. */
export function appleMusicTokenMaxAgeSec(): number {
  const raw = process.env.APPLE_MUSIC_TOKEN_MAX_AGE_SEC?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 60) return n;
  }
  return 86_400 * 30; // 30 days — refresh cache well before Apple's max
}

export function appleMusicConfigured(): boolean {
  return Boolean(
    appleMusicTeamId() && appleMusicKeyId() && appleMusicPrivateKey()
  );
}
