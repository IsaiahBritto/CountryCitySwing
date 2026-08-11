import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  canViewClassLevelBreakdown,
  isClassLevelBreakdownViewer,
} from "@/lib/classLevelRegistrationAccess";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Chicago";
const HANNAH_ID = "4b2e7196-75b3-4c28-b4bd-099f19d22781";
const OTHER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const classEvent = {
  type: "Class",
  starts_at: dayjs.tz("2026-08-11 19:00", TZ).toISOString(),
  ends_at: dayjs.tz("2026-08-12 01:00", TZ).toISOString(),
  time_zone: TZ,
};

describe("isClassLevelBreakdownViewer", () => {
  it("includes Hannah Bonaguide", () => {
    expect(isClassLevelBreakdownViewer(HANNAH_ID)).toBe(true);
    expect(isClassLevelBreakdownViewer(OTHER_ID)).toBe(false);
  });
});

describe("canViewClassLevelBreakdown", () => {
  it("allows admin anytime", () => {
    const before = dayjs.tz("2026-08-10 12:00", TZ).toDate();
    expect(canViewClassLevelBreakdown(OTHER_ID, "admin", classEvent, before)).toBe(
      true
    );
  });

  it("allows Hannah during the registration window only", () => {
    const before = dayjs.tz("2026-08-10 12:00", TZ).toDate();
    const during = dayjs.tz("2026-08-11 18:00", TZ).toDate();
    expect(canViewClassLevelBreakdown(HANNAH_ID, "instructor", classEvent, before)).toBe(
      false
    );
    expect(canViewClassLevelBreakdown(HANNAH_ID, "instructor", classEvent, during)).toBe(
      true
    );
  });

  it("denies other instructors even during the window", () => {
    const during = dayjs.tz("2026-08-11 18:00", TZ).toDate();
    expect(canViewClassLevelBreakdown(OTHER_ID, "instructor", classEvent, during)).toBe(
      false
    );
  });
});
