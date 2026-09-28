"use client";

import dynamic from "next/dynamic";
import GoldToggle from "@/components/GoldToggle";
import type { InstructorProfileViewData } from "@/lib/instructorProfileFields";

const InstructorLessonCalendar = dynamic(
  () => import("@/components/InstructorLessonCalendar"),
  { ssr: false }
);

export type { InstructorProfileViewData };

/** @deprecated Use InstructorProfileViewData */
export type InstructorProfile = InstructorProfileViewData;

export default function InstructorProfileView({
  profile,
  fromDirectory,
  embeddedPreview = false,
  hideBookingCalendar = false,
}: {
  profile: InstructorProfileViewData;
  fromDirectory?: boolean;
  embeddedPreview?: boolean;
  /** Preview tab: skip heavy calendar unless scheduling enabled */
  hideBookingCalendar?: boolean;
}) {
  const normalize = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase();
  const isNonCCS = (profile.role ?? "").toLowerCase() === "non-ccs-instructor";
  const getInstructorTitle = (
    first: string | null | undefined,
    last: string | null | undefined
  ) => {
    if (fromDirectory && isNonCCS) return "Instructor";
    const f = normalize(first);
    const l = normalize(last);
    if (f === "isaiah" && l === "britto") return "Owner & Head Instructor";
    if (f === "hannah" && l === "bonaguide") return "Head Instructor";
    return "Assistant Instructor";
  };

  const displayTitle = getInstructorTitle(
    profile.first_name,
    profile.last_name
  );
  const show = (val?: string | null) =>
    val !== null && val !== undefined && val.trim() !== "";

  const externalHref = (
    url: string | null | undefined,
    options?: { instagram?: boolean }
  ): string => {
    const s = (url ?? "").trim();
    if (!s) return "#";
    if (/^https?:\/\//i.test(s)) return s;
    if (options?.instagram && /^@?[\w.]+$/.test(s)) {
      const handle = s.replace(/^@/, "");
      return `https://instagram.com/${handle}`;
    }
    return "https://" + s.replace(/^\/+/, "");
  };

  const inner = (
    <div
      className={
        "relative text-white space-y-6 break-words " +
        (embeddedPreview
          ? "rounded-xl bg-neutral-800/80 p-4 sm:p-6 text-left sm:text-center"
          : "max-h-[90vh] overflow-y-auto rounded-t-2xl bg-neutral-800 p-6 sm:rounded-lg sm:p-8 shadow-[0_0_25px_rgba(242,201,76,0.25)] text-left sm:text-center scrollbar-black")
      }
    >
      {profile.photo_url && (
        <img
          src={profile.photo_url ?? ""}
          alt={`${profile.first_name ?? ""} ${profile.last_name ?? ""}`}
          className="w-40 h-40 rounded-full mx-auto mb-4 object-cover border-2 border-yellow-400"
        />
      )}

      <div className="text-center">
        <h2 className="text-3xl font-bold text-primary mb-1 break-words">
          {profile.first_name} {profile.last_name}
        </h2>
        <p className="text-gray-400 italic mb-6 break-words">{displayTitle}</p>
      </div>

      {show(profile.prayer) && (
        <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-line break-words">
          🙏 {profile.prayer}
        </p>
      )}

      {show(profile.bio_long) && (
        <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-line break-words">
          {profile.bio_long}
        </p>
      )}

      {show(profile.specialty) && (
        <p className="text-yellow-400 font-semibold break-words">
          Specialty: {profile.specialty}
        </p>
      )}

      {(show(profile.teaching_style) || show(profile.teaching_since)) && (
        <div className="space-y-2 break-words">
          {show(profile.teaching_style) && (
            <p className="text-gray-300">
              <span className="text-primary font-medium">Teaching Style:</span>{" "}
              {profile.teaching_style}
            </p>
          )}
          {show(profile.teaching_since) && (
            <p className="text-gray-300">
              <span className="text-primary font-medium">Teaching Since:</span>{" "}
              {profile.teaching_since
                ? new Date(profile.teaching_since).getFullYear()
                : ""}
            </p>
          )}
        </div>
      )}

      {show(profile.favorite_song) && (
        <p className="text-gray-300 break-words">
          <span className="text-primary font-medium">Favorite Song:</span>{" "}
          {profile.favorite_song}
        </p>
      )}

      <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-4 max-w-md mx-auto">
        <GoldToggle
          checked={!!profile.accepting_new_students}
          disabled
          label="Accepting new students for private lessons"
        />
      </div>

      {show(profile.private_lessons) && (
        <div className="break-words">
          <p className="text-primary font-medium mb-1">Private Lessons:</p>
          <p className="text-gray-300 whitespace-pre-line mb-3">
            {profile.private_lessons}
          </p>
          {show(profile.private_lessons_link) && (
            <a
              href={externalHref(profile.private_lessons_link)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline decoration-1 underline-offset-2 hover:shadow-[0_0_8px_rgba(242,201,76,0.8)] transition-all duration-300 break-all"
            >
              View Private Lesson Schedule →
            </a>
          )}
        </div>
      )}

      {!!profile.scheduling_enabled &&
        profile.id &&
        !hideBookingCalendar && (
          <div className="mt-10">
            <h3 className="text-2xl font-semibold text-primary mb-4 text-center">
              Book a Private Lesson
            </h3>
            <InstructorLessonCalendar instructorId={profile.id} />
          </div>
        )}

      {(show(profile.instagram_url) || show(profile.phone_number)) && (
        <div className="mt-8 border-t border-neutral-700 pt-6 space-y-3 text-center">
          {show(profile.instagram_url) && (
            <p>
              <a
                href={externalHref(profile.instagram_url, { instagram: true })}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline decoration-1 underline-offset-2 hover:shadow-[0_0_8px_rgba(242,201,76,0.8)] transition-all duration-300 break-all"
              >
                Instagram
              </a>
            </p>
          )}
          {show(profile.phone_number) && (
            <p className="text-gray-300 break-words">
              <span className="text-primary font-medium">Phone:</span>{" "}
              {profile.phone_number}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (embeddedPreview) {
    return inner;
  }

  return inner;
}
