import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  buildOccupiedClassEventDates,
  nextAvailableClassTuesdayDateTimeLocal,
} from "@/lib/classEventDefaults";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Chicago";

describe("nextAvailableClassTuesdayDateTimeLocal", () => {
  it("uses the upcoming Tuesday at 6:45 PM when before that time", () => {
    const now = dayjs.tz("2026-08-25 15:00", TZ).toDate(); // Tuesday
    expect(nextAvailableClassTuesdayDateTimeLocal(TZ, new Set(), now)).toBe(
      "2026-08-25T18:45"
    );
  });

  it("uses next week's Tuesday when today's 6:45 PM has passed", () => {
    const now = dayjs.tz("2026-08-25 20:00", TZ).toDate(); // Tuesday
    expect(nextAvailableClassTuesdayDateTimeLocal(TZ, new Set(), now)).toBe(
      "2026-09-01T18:45"
    );
  });

  it("uses the next calendar Tuesday from a non-Tuesday", () => {
    const now = dayjs.tz("2026-08-26 15:00", TZ).toDate(); // Wednesday
    expect(nextAvailableClassTuesdayDateTimeLocal(TZ, new Set(), now)).toBe(
      "2026-09-01T18:45"
    );
  });

  it("skips Tuesdays that already have a class event", () => {
    const now = dayjs.tz("2026-08-26 15:00", TZ).toDate();
    const occupied = new Set(["2026-09-01"]);
    expect(nextAvailableClassTuesdayDateTimeLocal(TZ, occupied, now)).toBe(
      "2026-09-08T18:45"
    );
  });
});

describe("buildOccupiedClassEventDates", () => {
  it("collects class event dates in each event time zone", () => {
    const dates = buildOccupiedClassEventDates([
      {
        id: 1,
        type: "Class",
        starts_at: dayjs.tz("2026-09-01 18:45", TZ).toISOString(),
        time_zone: TZ,
      },
      {
        id: 2,
        type: "Social",
        starts_at: dayjs.tz("2026-09-08 20:00", TZ).toISOString(),
        time_zone: TZ,
      },
    ]);
    expect(dates.has("2026-09-01")).toBe(true);
    expect(dates.has("2026-09-08")).toBe(false);
  });

  it("excludes the event being edited", () => {
    const dates = buildOccupiedClassEventDates(
      [
        {
          id: 42,
          type: "Class",
          starts_at: dayjs.tz("2026-09-01 18:45", TZ).toISOString(),
          time_zone: TZ,
        },
      ],
      { excludeEventId: 42 }
    );
    expect(dates.size).toBe(0);
  });
});
