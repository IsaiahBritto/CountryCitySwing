import { describe, expect, it } from "vitest";
import { sessionChannelName } from "@/lib/spotify/useSessionCommandChannel";

describe("useSessionCommandChannel helpers", () => {
  it("builds stable channel names per session", () => {
    expect(sessionChannelName("abc-123")).toBe("dj-session-abc-123");
  });
});
