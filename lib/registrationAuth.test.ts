import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { SOCIAL_FINANCE_VIEWER_IDS, isSocialFinanceViewer } from "@/lib/socialFinanceAccess";
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
const MEMBER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const socialStart = dayjs.tz("2026-05-29 20:00", TZ).toISOString();
const socialEnd = dayjs.tz("2026-05-30 02:00", TZ).toISOString();

describe("resolveRegistrationAccess", () => {
  it("does not grant social_viewer via former Brandon/Kyler UUID allowlist", () => {
    expect(SOCIAL_FINANCE_VIEWER_IDS.size).toBe(0);
    expect(isSocialFinanceViewer(BRANDON_ID)).toBe(false);
    expect(isSocialFinanceViewer(KYLER_ID)).toBe(false);
    expect(resolveRegistrationAccess(BRANDON_ID, "member")).toBeNull();
    expect(resolveRegistrationAccess(KYLER_ID, "member")).toBeNull();
  });

  it("grants admin and instructor by role", () => {
    expect(resolveRegistrationAccess(MEMBER_ID, "admin")).toBe("admin");
    expect(resolveRegistrationAccess(MEMBER_ID, "instructor")).toBe("instructor");
  });
});

describe("canViewRegistrationEvent", () => {
  const socialEvent = {
    type: "social",
    starts_at: socialStart,
    ends_at: socialEnd,
    time_zone: TZ,
  };

  it("allows social_viewer to view Social events (legacy level still supported)", () => {
    expect(canViewRegistrationEvent("social_viewer", socialEvent)).toBe(true);
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
