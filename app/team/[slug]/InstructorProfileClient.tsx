"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/solid";

const InstructorLessonCalendar = dynamic(
  () => import("@/components/InstructorLessonCalendar"),
  { ssr: false }
);

export interface InstructorProfile {
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
  prayer: string | null;
}

export default function InstructorProfileClient({
  profile,
  fromDirectory,
}: {
  profile: InstructorProfile;
  /** When true, profile was opened from Find Instructors; show "Instructor" for non-CCS. */
  fromDirectory?: boolean;
}) {
  const router = useRouter();

  const handleClose = () => {
    router.back();
  };

  const normalize = (s: string) => s.trim().toLowerCase();
  const isNonCCS = (profile.role ?? "").toLowerCase() === "non-ccs-instructor";
  const getInstructorTitle = (first: string, last: string) => {
    if (fromDirectory && isNonCCS) return "Instructor";
    const f = normalize(first);
    const l = normalize(last);
    if (f === "isaiah" && l === "britto") return "Owner & Head Instructor";
    if (f === "malissa" && l === "petersen") return "Head Instructor";
    return "Assistant Instructor";
  };

  const displayTitle = getInstructorTitle(profile.first_name, profile.last_name);
  const show = (val?: string | null) =>
    val !== null && val !== undefined && val.trim() !== "";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <section
        className="max-w-3xl mx-auto text-center px-6 py-12 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-neutral-800 rounded-lg p-8 shadow-[0_0_25px_rgba(242,201,76,0.25)] text-left sm:text-center space-y-6 break-words relative max-h-[90vh] overflow-y-auto scrollbar-black">
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-neutral-400 hover:text-primary transition-colors z-10"
            onClick={handleClose}
            aria-label="Close profile"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        {/* Photo */}
        {profile.photo_url && (
          <img
            src={profile.photo_url ?? ""}
            alt={`${profile.first_name ?? ""} ${profile.last_name ?? ""}`}
            className="w-40 h-40 rounded-full mx-auto mb-4 object-cover border-2 border-yellow-400"
          />
        )}

        {/* Name + Role */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-primary mb-1 break-words">
            {profile.first_name} {profile.last_name}
          </h2>
          <p className="text-gray-400 italic mb-6 break-words">{displayTitle}</p>
        </div>

        {/* Prayer */}
        {show(profile.prayer) && (
          <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-line break-words">
            🙏 {profile.prayer}
          </p>
        )}

        {/* Bio */}
        {show(profile.bio_long) && (
          <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-line break-words">
            {profile.bio_long}
          </p>
        )}

        {/* Specialty */}
        {show(profile.specialty) && (
          <p className="text-yellow-400 font-semibold break-words">
            Specialty: {profile.specialty}
          </p>
        )}

        {/* Teaching Info */}
        {(show(profile.teaching_style) || show(profile.teaching_since)) && (
          <div className="space-y-2 break-words">
            {show(profile.teaching_style) && (
              <p className="text-gray-300">
                <span className="text-primary font-medium">
                  Teaching Style:
                </span>{" "}
                {profile.teaching_style}
              </p>
            )}
            {show(profile.teaching_since) && (
              <p className="text-gray-300">
                <span className="text-primary font-medium">
                  Teaching Since:
                </span>{" "}
                {profile.teaching_since
                  ? new Date(profile.teaching_since).getFullYear()
                  : ""}
              </p>
            )}
          </div>
        )}

        {/* Favorite Song */}
        {show(profile.favorite_song) && (
          <p className="text-gray-300 break-words">
            <span className="text-primary font-medium">Favorite Song:</span>{" "}
            {profile.favorite_song}
          </p>
        )}

        {/* Private Lessons */}
        {show(profile.private_lessons) && (
          <div className="break-words">
            <p className="text-primary font-medium mb-1">Private Lessons:</p>
            <p className="text-gray-300 whitespace-pre-line mb-3">
              {profile.private_lessons}
            </p>

            {/* Link */}
            {show(profile.private_lessons_link) && (
              <a
                href={profile.private_lessons_link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline decoration-1 underline-offset-2 hover:shadow-[0_0_8px_rgba(242,201,76,0.8)] transition-all duration-300 break-all"
              >
                View Private Lesson Schedule →
              </a>
            )}
          </div>
        )}

        {/* Booking Calendar - only render when profile is loaded */}
        {!!profile.scheduling_enabled && profile.id && (
          <div className="mt-10">
            <h3 className="text-2xl font-semibold text-primary mb-4 text-center">
              Book a Private Lesson
            </h3>
            <InstructorLessonCalendar instructorId={profile.id} />
          </div>
        )}

        {/* Contact & Social */}
        {(show(profile.instagram_url) || show(profile.phone_number)) && (
          <div className="mt-8 border-t border-neutral-700 pt-6 space-y-3 text-center">
            {show(profile.instagram_url) && (
              <p>
                <a
                  href={profile.instagram_url ?? "#"}
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
      </section>
    </div>
  );
}
