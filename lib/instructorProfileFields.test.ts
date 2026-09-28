import { describe, expect, it } from "vitest";
import {
  directoryReadinessChecklist,
  formatShownOn,
  isDirectoryListingReady,
  isInstructorLikeRole,
} from "@/lib/instructorProfileFields";

describe("isInstructorLikeRole", () => {
  it("recognizes instructor roles", () => {
    expect(isInstructorLikeRole("non-ccs-instructor")).toBe(true);
    expect(isInstructorLikeRole("instructor")).toBe(true);
    expect(isInstructorLikeRole("attendee")).toBe(false);
  });
});

describe("isDirectoryListingReady", () => {
  it("requires name and photo or bio", () => {
    expect(
      isDirectoryListingReady({
        id: "1",
        first_name: "A",
        last_name: "B",
        photo_url: null,
        role: "non-ccs-instructor",
        bio_long: "Bio",
        specialty: null,
        prayer: null,
        teaching_style: null,
        teaching_since: null,
        favorite_song: null,
        instagram_url: null,
        phone_number: null,
        private_lessons: null,
        private_lessons_link: null,
        private_lesson_disclaimer: null,
        scheduling_enabled: null,
        accepting_new_students: null,
        state: null,
        zip_code: null,
      })
    ).toBe(true);
    expect(
      isDirectoryListingReady({
        id: "1",
        first_name: "A",
        last_name: "",
        photo_url: "x",
        role: "non-ccs-instructor",
        bio_long: null,
        specialty: null,
        prayer: null,
        teaching_style: null,
        teaching_since: null,
        favorite_song: null,
        instagram_url: null,
        phone_number: null,
        private_lessons: null,
        private_lessons_link: null,
        private_lesson_disclaimer: null,
        scheduling_enabled: null,
        accepting_new_students: null,
        state: null,
        zip_code: null,
      })
    ).toBe(false);
  });
});

describe("directoryReadinessChecklist", () => {
  it("flags missing photo and bio", () => {
    const items = directoryReadinessChecklist({
      id: "1",
      first_name: "A",
      last_name: "B",
      photo_url: null,
      role: "non-ccs-instructor",
      bio_long: null,
      specialty: null,
      prayer: null,
      teaching_style: null,
      teaching_since: null,
      favorite_song: null,
      instagram_url: null,
      phone_number: null,
      private_lessons: null,
      private_lessons_link: null,
      private_lesson_disclaimer: null,
      scheduling_enabled: null,
      accepting_new_students: null,
      state: null,
      zip_code: null,
    });
    expect(items.find((i) => i.id === "photoOrBio")?.ok).toBe(false);
  });
});

describe("formatShownOn", () => {
  it("joins labels", () => {
    expect(formatShownOn(["fullProfile", "directoryList"])).toContain(
      "Full profile"
    );
  });
});
