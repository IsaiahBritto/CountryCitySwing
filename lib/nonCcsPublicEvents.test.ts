import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  communityEventPublicTab,
  getCommunityPastBoundaryInstant,
  isCommunityEventPublicPast,
  NON_CCS_PUBLIC_TAB_TZ,
} from "@/lib/nonCcsPublicEvents";

dayjs.extend(utc);
dayjs.extend(timezone);

describe("nonCcsPublicEvents", () => {
  it("stays upcoming on the event's last local day before PST midnight after", () => {
    const event = {
      starts_at: "2026-06-15T20:00:00Z",
      ends_at: null,
      time_zone: "America/Chicago",
    };
    const boundary = getCommunityPastBoundaryInstant(event);
    expect(boundary).not.toBeNull();
    const justBefore = boundary!.subtract(1, "minute");
    expect(isCommunityEventPublicPast(event, justBefore)).toBe(false);
    expect(communityEventPublicTab(event, justBefore)).toBe("upcoming");
  });

  it("becomes past at 00:00 PST on the day after the last event day", () => {
    const event = {
      starts_at: "2026-06-15T20:00:00Z",
      ends_at: null,
      time_zone: "America/Chicago",
    };
    const boundary = getCommunityPastBoundaryInstant(event)!;
    expect(boundary.format("YYYY-MM-DD HH:mm")).toBe(
      dayjs
        .tz("2026-06-16", NON_CCS_PUBLIC_TAB_TZ)
        .startOf("day")
        .format("YYYY-MM-DD HH:mm")
    );
    expect(isCommunityEventPublicPast(event, boundary)).toBe(true);
    expect(communityEventPublicTab(event, boundary)).toBe("past");
  });

  it("uses ends_at for the last calendar day in the event time zone", () => {
    const event = {
      starts_at: "2026-07-01T15:00:00Z",
      ends_at: "2026-07-03T02:00:00Z",
      time_zone: "America/Los_Angeles",
    };
    const boundary = getCommunityPastBoundaryInstant(event)!;
    // ends_at is still July 2 in Los Angeles — past tab starts July 3 00:00 PST
    expect(boundary.format("YYYY-MM-DD")).toBe("2026-07-03");
  });
});