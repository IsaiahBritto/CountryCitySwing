import { describe, expect, it } from "vitest";
import {
  communityEventPublicSlug,
  isUuid,
  slugifyCommunityEventTitle,
} from "@/lib/nonCcsEventSlug";

describe("nonCcsEventSlug", () => {
  it("slugifies title and date", () => {
    expect(
      communityEventPublicSlug({
        title: "GAC Classic",
        starts_at: "2026-11-14T21:00:00Z",
        time_zone: "America/Chicago",
      })
    ).toBe("GAC-Classic-11-14-2026");
  });

  it("slugifyCommunityEventTitle", () => {
    expect(slugifyCommunityEventTitle("GAC Classic")).toBe("GAC-Classic");
  });

  it("isUuid", () => {
    expect(isUuid("09f0f95c-6a5c-459e-aa05-644ba04be10d")).toBe(true);
    expect(isUuid("GAC-Classic-11-14-2026")).toBe(false);
  });
});