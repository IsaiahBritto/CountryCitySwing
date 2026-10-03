/** Where instructor profile data appears on the site. */
export type ProfileShownOn =
  | "fullProfile"
  | "directoryList"
  | "directoryMap"
  | "teamCard";

export const SHOWN_ON_LABELS: Record<ProfileShownOn, string> = {
  fullProfile: "Full profile page",
  directoryList: "Find Instructors list",
  directoryMap: "Find Instructors map",
  teamCard: "CCS Team page card",
};

export type InstructorFieldKey =
  | "first_name"
  | "last_name"
  | "photo_url"
  | "specialty"
  | "bio_long"
  | "prayer"
  | "teaching_style"
  | "teaching_since"
  | "favorite_song"
  | "state"
  | "zip_code"
  | "accepting_new_students"
  | "instagram_url"
  | "phone_number"
  | "private_lessons"
  | "private_lessons_link"
  | "scheduling_enabled"
  | "private_lesson_disclaimer";

export type InstructorFieldInputType =
  | "text"
  | "textarea"
  | "date"
  | "toggle"
  | "checkbox";

export interface InstructorFieldDef {
  key: InstructorFieldKey;
  label: string;
  help: string;
  shownOn: ProfileShownOn[];
  inputType: InstructorFieldInputType;
  /** Required for non-CCS directory listing (name + photo or bio). */
  directoryRequired?: boolean;
  placeholder?: string;
  rows?: number;
}

export type InstructorProfileSectionId =
  | "publicProfile"
  | "directoryMap"
  | "contactSocial"
  | "privateLessons"
  | "ccsBooking";

export interface InstructorProfileSection {
  id: InstructorProfileSectionId;
  title: string;
  description: string;
  fields: InstructorFieldDef[];
  /** Only for instructor/admin roles */
  ccsInstructorOnly?: boolean;
}

export const INSTRUCTOR_PROFILE_SECTIONS: InstructorProfileSection[] = [
  {
    id: "publicProfile",
    title: "Your public profile",
    description:
      "What students see when they open your full profile. Your title (e.g. Assistant Instructor) is set automatically for CCS team members.",
    fields: [
      {
        key: "first_name",
        label: "First name",
        help: "Your display name everywhere your profile appears.",
        shownOn: ["fullProfile", "directoryList", "teamCard", "directoryMap"],
        inputType: "text",
        directoryRequired: true,
      },
      {
        key: "last_name",
        label: "Last name",
        help: "Your display name everywhere your profile appears.",
        shownOn: ["fullProfile", "directoryList", "teamCard", "directoryMap"],
        inputType: "text",
        directoryRequired: true,
      },
      {
        key: "specialty",
        label: "Specialty",
        help: "Short tagline under your name (e.g. Country Swing).",
        shownOn: ["fullProfile", "directoryList", "teamCard"],
        inputType: "text",
        placeholder: "e.g. Country Swing",
      },
      {
        key: "bio_long",
        label: "Full bio",
        help: "Your story on the full profile page. Required for directory listing if you have no photo.",
        shownOn: ["fullProfile"],
        inputType: "textarea",
        directoryRequired: true,
        rows: 5,
        placeholder: "Share your dance background and what you teach…",
      },
      {
        key: "prayer",
        label: "Prayer or dedication (optional)",
        help: "Shown at the top of your full profile with a prayer emoji.",
        shownOn: ["fullProfile"],
        inputType: "text",
        placeholder: "Optional personal note",
      },
      {
        key: "teaching_style",
        label: "Teaching style",
        help: "How you describe your approach to teaching.",
        shownOn: ["fullProfile"],
        inputType: "text",
      },
      {
        key: "teaching_since",
        label: "Teaching since (date)",
        help: "Only the year is shown on your public profile.",
        shownOn: ["fullProfile"],
        inputType: "date",
      },
      {
        key: "favorite_song",
        label: "Favorite song",
        help: "Displayed on your full profile.",
        shownOn: ["fullProfile"],
        inputType: "text",
      },
    ],
  },
  {
    id: "directoryMap",
    title: "Find Instructors & map",
    description:
      "Help students find you in the directory. ZIP code improves your map pin; state alone still places you approximately.",
    fields: [
      {
        key: "state",
        label: "State",
        help: "Groups you under your state on Find Instructors.",
        shownOn: ["directoryList", "directoryMap"],
        inputType: "text",
      },
      {
        key: "zip_code",
        label: "ZIP code",
        help: "Used to place your pin on the map when you save.",
        shownOn: ["directoryMap"],
        inputType: "text",
        placeholder: "e.g. 37201",
      },
      {
        key: "accepting_new_students",
        label: "Accepting new students for private lessons",
        help: "When on, you can appear when visitors filter Find Instructors to instructors accepting new students.",
        shownOn: ["fullProfile", "directoryList"],
        inputType: "toggle",
      },
    ],
  },
  {
    id: "contactSocial",
    title: "Contact & social",
    description: "Shown at the bottom of your full profile.",
    fields: [
      {
        key: "instagram_url",
        label: "Instagram",
        help: "Full URL or @handle (e.g. @yourname).",
        shownOn: ["fullProfile"],
        inputType: "text",
        placeholder: "https://instagram.com/you or @you",
      },
      {
        key: "phone_number",
        label: "Phone number",
        help: "Displayed on your full profile for students to contact you.",
        shownOn: ["fullProfile"],
        inputType: "text",
      },
    ],
  },
  {
    id: "privateLessons",
    title: "Private lessons",
    description: "Describe how students can book with you outside CCS scheduling.",
    fields: [
      {
        key: "private_lessons",
        label: "Private lessons info",
        help: "Rates, locations, policies—shown on your full profile.",
        shownOn: ["fullProfile"],
        inputType: "textarea",
        rows: 4,
      },
      {
        key: "private_lessons_link",
        label: "External schedule link",
        help: 'Becomes a "View Private Lesson Schedule →" link on your profile.',
        shownOn: ["fullProfile"],
        inputType: "text",
        placeholder: "https://…",
      },
    ],
  },
  {
    id: "ccsBooking",
    title: "CCS online booking",
    description:
      "Let students book through the CCS website. After enabling, manage time slots below the save button.",
    ccsInstructorOnly: true,
    fields: [
      {
        key: "scheduling_enabled",
        label: "Enable scheduling through CCS website",
        help: "Shows a bookable calendar on your public profile.",
        shownOn: ["fullProfile"],
        inputType: "checkbox",
      },
      {
        key: "private_lesson_disclaimer",
        label: "Booking disclaimer (optional)",
        help: "Students must acknowledge this before confirming a booking on your calendar.",
        shownOn: ["fullProfile"],
        inputType: "textarea",
        rows: 4,
        placeholder: "Cancellation policy, what to bring, studio rules…",
      },
    ],
  },
];

export interface EditableInstructorProfile {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role: string;
  instagram_url: string | null;
  teaching_since: string | null;
  favorite_song: string | null;
  teaching_style: string | null;
  bio_long: string | null;
  specialty: string | null;
  phone_number: string | null;
  private_lessons: string | null;
  private_lessons_link: string | null;
  private_lesson_disclaimer: string | null;
  scheduling_enabled: boolean | null;
  accepting_new_students: boolean | null;
  prayer: string | null;
  state: string | null;
  zip_code: string | null;
}

/** Profile page / instructor tabs (editable fields + account email). */
export type InstructorProfileFormState = EditableInstructorProfile & {
  email: string;
  newsletter_opt_in?: boolean;
};

export function formatShownOn(shownOn: ProfileShownOn[]): string {
  return shownOn.map((s) => SHOWN_ON_LABELS[s]).join(" · ");
}

export function isInstructorLikeRole(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return (
    r === "admin" ||
    r === "instructor" ||
    r === "non-ccs-instructor" ||
    r.includes("instructor")
  );
}

export function isCcsCoreInstructor(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "instructor";
}

export function isNonCcsInstructor(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "non-ccs-instructor";
}

/** Matches directory inclusion rules in app/instructors/page.tsx */
export function isDirectoryListingReady(p: EditableInstructorProfile): boolean {
  const hasName =
    (p.first_name ?? "").trim() !== "" && (p.last_name ?? "").trim() !== "";
  const hasContent =
    (p.photo_url ?? "").trim() !== "" || (p.bio_long ?? "").trim() !== "";
  return hasName && hasContent;
}

export type DirectoryCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  sectionId: InstructorProfileSectionId;
  optional?: boolean;
};

export function directoryReadinessChecklist(
  p: EditableInstructorProfile
): DirectoryCheckItem[] {
  const hasName =
    (p.first_name ?? "").trim() !== "" && (p.last_name ?? "").trim() !== "";
  const hasPhoto = (p.photo_url ?? "").trim() !== "";
  const hasBio = (p.bio_long ?? "").trim() !== "";
  const hasLocation =
    (p.state ?? "").trim() !== "" || (p.zip_code ?? "").trim() !== "";

  return [
    {
      id: "name",
      label: "First and last name",
      ok: hasName,
      sectionId: "publicProfile",
    },
    {
      id: "photoOrBio",
      label: "Profile photo or full bio (need at least one)",
      ok: hasPhoto || hasBio,
      sectionId: "publicProfile",
    },
    {
      id: "specialty",
      label: "Specialty (recommended)",
      ok: (p.specialty ?? "").trim() !== "",
      sectionId: "publicProfile",
      optional: true,
    },
    {
      id: "location",
      label: "State or ZIP for map (recommended)",
      ok: hasLocation,
      sectionId: "directoryMap",
      optional: true,
    },
  ];
}

/** Public instructor profile shape used by InstructorProfileView. */
export interface InstructorProfileViewData {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role: string;
  bio: string | null;
  bio_long: string | null;
  instagram_url: string | null;
  teaching_since: string | null;
  favorite_song: string | null;
  teaching_style: string | null;
  specialty: string | null;
  phone_number: string | null;
  private_lessons: string | null;
  private_lessons_link: string | null;
  scheduling_enabled: boolean | null;
  accepting_new_students: boolean | null;
  prayer: string | null;
}

export function profileToInstructorView(
  p: EditableInstructorProfile
): InstructorProfileViewData {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    photo_url: p.photo_url,
    role: p.role,
    bio: null,
    bio_long: p.bio_long,
    instagram_url: p.instagram_url,
    teaching_since: p.teaching_since,
    favorite_song: p.favorite_song,
    teaching_style: p.teaching_style,
    specialty: p.specialty,
    phone_number: p.phone_number,
    private_lessons: p.private_lessons,
    private_lessons_link: p.private_lessons_link,
    scheduling_enabled: p.scheduling_enabled,
    accepting_new_students: p.accepting_new_students,
    prayer: p.prayer,
  };
}
