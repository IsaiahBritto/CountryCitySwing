import crypto from "crypto";
import {
  appleMusicConfigured,
  appleMusicKeyId,
  appleMusicPrivateKey,
  appleMusicTeamId,
  appleMusicTokenMaxAgeSec,
} from "@/lib/appleMusic/config";

export type DeveloperTokenResult = {
  token: string;
  expiresAt: string;
};

type CachedToken = {
  token: string;
  expiresAtMs: number;
};

let cached: CachedToken | null = null;

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signEs256Jwt(
  header: object,
  payload: object,
  privateKeyPem: string
): string {
  const headerPart = base64UrlJson(header);
  const payloadPart = base64UrlJson(payload);
  const signingInput = `${headerPart}.${payloadPart}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign({
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function createAppleDeveloperToken(nowMs: number = Date.now()): DeveloperTokenResult {
  if (!appleMusicConfigured()) {
    throw new Error("Apple Music developer credentials are not configured");
  }
  const teamId = appleMusicTeamId()!;
  const keyId = appleMusicKeyId()!;
  const privateKey = appleMusicPrivateKey()!;
  const maxAgeSec = appleMusicTokenMaxAgeSec();
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + maxAgeSec;

  const token = signEs256Jwt(
    { alg: "ES256", kid: keyId },
    { iss: teamId, iat, exp },
    privateKey
  );

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/** Reuse cached token until 80% of lifetime elapsed. */
export function getCachedAppleDeveloperToken(
  nowMs: number = Date.now()
): DeveloperTokenResult {
  if (cached && cached.expiresAtMs > nowMs + 60_000) {
    const issuedMs = cached.expiresAtMs - appleMusicTokenMaxAgeSec() * 1000;
    const lifetimeMs = cached.expiresAtMs - issuedMs;
    const refreshAt = issuedMs + lifetimeMs * 0.8;
    if (nowMs < refreshAt) {
      return {
        token: cached.token,
        expiresAt: new Date(cached.expiresAtMs).toISOString(),
      };
    }
  }

  const fresh = createAppleDeveloperToken(nowMs);
  const expiresAtMs = Date.parse(fresh.expiresAt);
  cached = { token: fresh.token, expiresAtMs };
  return fresh;
}

/** Test helper */
export function clearDeveloperTokenCache(): void {
  cached = null;
}
