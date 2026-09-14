import { describe, expect, it } from "vitest";
import { parseSpotifyApiError } from "@/lib/spotify/spotifyApiErrors";

describe("parseSpotifyApiError", () => {
  it("parses nested Spotify JSON string 404 device not found", () => {
    const raw =
      '{\n  "error" : {\n    "status" : 404,\n    "message" : "Device not found"\n  }\n}';
    const parsed = parseSpotifyApiError(raw, 404);
    expect(parsed.code).toBe("DEVICE_NOT_FOUND");
    expect(parsed.action).toBe("reconnect_deck");
  });

  it("parses nested error object", () => {
    const parsed = parseSpotifyApiError(
      { error: { status: 404, message: "Device not found" } },
      404
    );
    expect(parsed.code).toBe("DEVICE_NOT_FOUND");
  });

  it("maps needsDeckReconnect style messages", () => {
    const parsed = parseSpotifyApiError(
      "Spotify reconnect required for DJ deck playback scopes",
      403
    );
    expect(parsed.code).toBe("SCOPE_MISSING");
    expect(parsed.action).toBe("reconnect_spotify");
  });

  it("maps session expired", () => {
    const parsed = parseSpotifyApiError("Session expired — sign in again", 401);
    expect(parsed.code).toBe("SESSION_EXPIRED");
    expect(parsed.action).toBe("sign_in");
  });

  it("passes through already-structured errors", () => {
    const structured = {
      code: "RATE_LIMITED" as const,
      title: "Busy",
      message: "Wait",
    };
    expect(parseSpotifyApiError(structured)).toEqual(structured);
  });

  it("handles unknown errors", () => {
    const parsed = parseSpotifyApiError("something weird", 500);
    expect(parsed.code).toBe("UNKNOWN");
  });
});
