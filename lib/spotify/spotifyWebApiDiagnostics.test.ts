import { describe, expect, it } from "vitest";
import {
  collectSpotifyRateLimitHeaders,
  parseSpotifyWebApiErrorBody,
} from "@/lib/spotify/spotifyWebApiDiagnostics";

describe("parseSpotifyWebApiErrorBody", () => {
  it("extracts reason from Spotify error JSON", () => {
    const body = JSON.stringify({
      error: {
        status: 429,
        message: "Too many requests",
        reason: "QUOTA_EXCEEDED",
      },
    });
    const parsed = parseSpotifyWebApiErrorBody(body);
    expect(parsed.reason).toBe("QUOTA_EXCEEDED");
    expect(parsed.message).toBe("Too many requests");
  });

  it("redacts tokens in JSON bodies", () => {
    const body = JSON.stringify({
      access_token: "secret",
      error: { message: "bad" },
    });
    const parsed = parseSpotifyWebApiErrorBody(body);
    expect(parsed.logBody).toEqual({
      access_token: "[REDACTED]",
      error: { message: "bad" },
    });
  });
});

describe("collectSpotifyRateLimitHeaders", () => {
  it("collects Retry-After and rate-related headers", () => {
    const headers = new Headers({
      "Retry-After": "12",
      "X-RateLimit-Remaining": "0",
      "Content-Type": "application/json",
    });
    expect(collectSpotifyRateLimitHeaders(headers)).toEqual({
      "retry-after": "12",
      "x-ratelimit-remaining": "0",
    });
  });
});
