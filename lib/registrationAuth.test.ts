import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { SOCIAL_FINANCE_VIEWER_IDS } from "@/lib/socialFinanceAccess";
import {
  canMutateRegistrationEvent,
  canViewRegistrationEvent,
  resolveRegistrationAccess,
  showRegistrationForEvents,
} from "@/lib/registrationAuthPolicy";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Chicago";
const BRANDON_ID = "1f87df67-d95d-4550-a974-43e6710fea5b";
const KYLER_ID = "f742f43a-c267-4148-8075-03c774b81641";

const socialStart = dayjs.tz("2026-05-29 20:00", TZ).toISOString();
const socialEnd = dayjs.tz("2026-05-30 02:00", TZ).toISOString();

describe("resolveRegistrationAccess", () => {
  it("grants social_viewer to both finance viewer IDs", () => {
    expect(resolveRegistrationAccess(BRANDON_ID, "member")).toBe("social_viewer");
    expect(resolveRegistrationAccess(KYLER_ID, "member")).toBe("social_viewer");
    expect(SOCIAL_FINANCE_VIEWER_IDS.has(BRANDON_ID)).toBe(true);
    expect(SOCIAL_FINANCE_VIEWER_IDS.has(KYLER_ID)).toBe(true);
  });

  it("prefers admin over social_viewer", () => {
    expect(resolveRegistrationAccess(BRANDON_ID, "admin")).toBe("admin");
  });
});

describe("canViewRegistrationEvent", () => {
  const socialEvent = {
    type: "social",
    starts_at: socialStart,
    ends_at: socialEnd,
    time_zone: TZ,
  };

  it("allows social_viewer to view before event day", () => {
    const now = dayjs.tz("2026-05-28 12:00", TZ).toDate();
    expect(canViewRegistrationEvent("social_viewer", socialEvent)).toBe(true);
    expect(canMutateRegistrationEvent("social_viewer", socialEvent, now)).toBe(false);
  });

  it("allows social_viewer to view after event ended", () => {
    const now = dayjs.tz("2026-06-01 12:00", TZ).toDate();
    expect(canViewRegistrationEvent("social_viewer", socialEvent)).toBe(true);
    expect(canMutateRegistrationEvent("social_viewer", socialEvent, now)).toBe(false);
  });

  it("denies social_viewer for non-social events", () => {
    expect(
      canViewRegistrationEvent("social_viewer", {
        ...socialEvent,
        type: "workshop",
      })
    ).toBe(false);
  });

  it("allows instructor only during registration window", () => {
    const workshop = { type: "workshop", starts_at: socialStart, ends_at: socialEnd, time_zone: TZ };
    const before = dayjs.tz("2026-05-28 12:00", TZ).toDate();
    const during = dayjs.tz("2026-05-29 10:00", TZ).toDate();
    expect(canViewRegistrationEvent("instructor", workshop, before)).toBe(false);
    expect(canMutateRegistrationEvent("instructor", workshop, before)).toBe(false);
    expect(canViewRegistrationEvent("instructor", workshop, during)).toBe(true);
    expect(canMutateRegistrationEvent("instructor", workshop, during)).toBe(true);
  });
});

describe("canMutateRegistrationEvent", () => {
  const socialEvent = {
    type: "social",
    starts_at: socialStart,
    ends_at: socialEnd,
    time_zone: TZ,
  };

  it("allows social_viewer to mutate during registration window", () => {
    const now = dayjs.tz("2026-05-29 21:00", TZ).toDate();
    expect(canMutateRegistrationEvent("social_viewer", socialEvent, now)).toBe(true);
  });
});

describe("showRegistrationForEvents", () => {
  it("returns true for social_viewer even with no events", () => {
    expect(showRegistrationForEvents("social_viewer", [])).toBe(true);
  });

  it("returns false for instructor with no window-open events", () => {
    const events = [
      {
        type: "social",
        starts_at: socialStart,
        ends_at: socialEnd,
        time_zone: TZ,
      },
    ];
    const before = dayjs.tz("2026-05-28 12:00", TZ).toDate();
    expect(showRegistrationForEvents("instructor", events, before)).toBe(false);
  });
});
