import { describe, expect, it, beforeEach } from "vitest";
import crypto from "crypto";
import {
  clearDeveloperTokenCache,
  createAppleDeveloperToken,
  getCachedAppleDeveloperToken,
} from "@/lib/appleMusic/developerToken";

function generateTestEcKey(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKey: publicKey.export({ type: "spki", format: "pem" }) as string,
  };
}

describe("createAppleDeveloperToken", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    clearDeveloperTokenCache();
  });

  it("signs a three-part JWT when credentials are set", () => {
    const { privateKey } = generateTestEcKey();
    process.env.APPLE_MUSIC_TEAM_ID = "TEAM123";
    process.env.APPLE_MUSIC_KEY_ID = "KEY456";
    process.env.APPLE_MUSIC_PRIVATE_KEY = privateKey;
    process.env.APPLE_MUSIC_TOKEN_MAX_AGE_SEC = "3600";

    const { token, expiresAt } = createAppleDeveloperToken(1_700_000_000_000);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    expect(Date.parse(expiresAt)).toBeGreaterThan(1_700_000_000_000);
  });

  it("returns the same token from cache before refresh threshold", () => {
    const { privateKey } = generateTestEcKey();
    process.env.APPLE_MUSIC_TEAM_ID = "TEAM123";
    process.env.APPLE_MUSIC_KEY_ID = "KEY456";
    process.env.APPLE_MUSIC_PRIVATE_KEY = privateKey;
    process.env.APPLE_MUSIC_TOKEN_MAX_AGE_SEC = "3600";

    const now = 1_700_000_000_000;
    const a = getCachedAppleDeveloperToken(now);
    const b = getCachedAppleDeveloperToken(now + 1000);
    expect(a.token).toBe(b.token);
  });
});
