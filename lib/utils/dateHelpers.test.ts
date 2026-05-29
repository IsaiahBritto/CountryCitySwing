import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { isRegistrationWindowOpen, formatEventScheduleSubtitle } from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Chicago";

describe("isRegistrationWindowOpen", () => {
  const overnightSocialStart = dayjs.tz("2026-05-29 20:00", TZ).toISOString();
  const overnightSocialEnd = dayjs.tz("2026-05-30 02:00", TZ).toISOString();

  it("opens on the event start day before start time", () => {
    const now = dayjs.tz("2026-05-29 10:00", TZ).toDate();
    expect(
      isRegistrationWindowOpen(overnightSocialStart, overnightSocialEnd, TZ, now)
    ).toBe(true);
  });

  it("stays open after midnight until ends_at", () => {
    const now = dayjs.tz("2026-05-30 01:00", TZ).toDate();
    expect(
      isRegistrationWindowOpen(overnightSocialStart, overnightSocialEnd, TZ, now)
    ).toBe(true);
  });

  it("closes after ends_at on the following day", () => {
    const now = dayjs.tz("2026-05-30 03:00", TZ).toDate();
    expect(
      isRegistrationWindowOpen(overnightSocialStart, overnightSocialEnd, TZ, now)
    ).toBe(false);
  });

  it("is closed before the event start day", () => {
    const now = dayjs.tz("2026-05-28 12:00", TZ).toDate();
    expect(
      isRegistrationWindowOpen(overnightSocialStart, overnightSocialEnd, TZ, now)
    ).toBe(false);
  });

  it("opens only on start day when ends_at is missing", () => {
    const sameDayStart = dayjs.tz("2026-06-01 19:00", TZ).toISOString();
    const onDay = dayjs.tz("2026-06-01 09:00", TZ).toDate();
    const nextDay = dayjs.tz("2026-06-02 09:00", TZ).toDate();
    expect(isRegistrationWindowOpen(sameDayStart, null, TZ, onDay)).toBe(true);
    expect(isRegistrationWindowOpen(sameDayStart, null, TZ, nextDay)).toBe(false);
  });

  it("opens on middle day of a multi-day event", () => {
    const start = dayjs.tz("2026-07-10 09:00", TZ).toISOString();
    const end = dayjs.tz("2026-07-12 18:00", TZ).toISOString();
    const middleDay = dayjs.tz("2026-07-11 12:00", TZ).toDate();
    expect(isRegistrationWindowOpen(start, end, TZ, middleDay)).toBe(true);
  });
});

describe("formatEventScheduleSubtitle", () => {
  it("shows start date only for Social events that end after midnight", () => {
    const startsAt = dayjs.tz("2026-05-29 20:00", TZ).toISOString();
    const endsAt = dayjs.tz("2026-05-30 01:00", TZ).toISOString();
    const subtitle = formatEventScheduleSubtitle(startsAt, endsAt, TZ, "Social");
    expect(subtitle).toContain("May 29, 2026");
    expect(subtitle).not.toContain("May 29 – 30");
    expect(subtitle).toContain("8:00 PM–1:00 AM");
    expect(subtitle).toContain("CDT");
  });

  it("still shows a date range for Convention multi-day events", () => {
    const startsAt = dayjs.tz("2026-05-29 09:00", TZ).toISOString();
    const endsAt = dayjs.tz("2026-05-31 18:00", TZ).toISOString();
    const subtitle = formatEventScheduleSubtitle(startsAt, endsAt, TZ, "Convention");
    expect(subtitle).toContain("May 29 – 31, 2026");
  });
});
