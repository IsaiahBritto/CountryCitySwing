"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import InstructorProfileEditor from "@/components/profile/InstructorProfileEditor";
import InstructorProfileView from "@/components/InstructorProfileView";
import {
  profileToInstructorView,
  SHOWN_ON_LABELS,
  type EditableInstructorProfile,
  type ProfileShownOn,
} from "@/lib/instructorProfileFields";
import { instructorPublicLinks } from "@/lib/instructorPublicLinks";

const InstructorSlotManager = dynamic(
  () => import("@/components/InstructorSlotManager"),
  { ssr: false }
);
const InstructorLessonCalendar = dynamic(
  () => import("@/components/InstructorLessonCalendar"),
  { ssr: false }
);

type TabId = "edit" | "preview";

export default function ProfileInstructorTabs({
  profile,
  setProfile,
  photoPreviewUrl,
  onPhotoFileChange,
  onSubmit,
  updating,
  saveMessage,
  demoteBlock,
  childrenAccountSettings,
}: {
  profile: EditableInstructorProfile & { email?: string; newsletter_opt_in?: boolean };
  setProfile: (p: EditableInstructorProfile & { email?: string; newsletter_opt_in?: boolean }) => void;
  photoPreviewUrl: string | null;
  onPhotoFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  updating: boolean;
  saveMessage: { type: "success" | "error"; text: string } | null;
  demoteBlock?: React.ReactNode;
  childrenAccountSettings: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("edit");

  const previewProfile = profileToInstructorView(profile);
  const links = instructorPublicLinks(
    profile.first_name,
    profile.last_name,
    profile.role
  );
  const isCcs =
    (profile.role ?? "").toLowerCase() === "instructor" ||
    (profile.role ?? "").toLowerCase() === "admin";

  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border border-neutral-700 p-1">
        {(
          [
            { id: "edit" as const, label: "Edit" },
            { id: "preview" as const, label: "Preview" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              "flex-1 rounded-md py-2 text-sm font-semibold transition " +
              (tab === id
                ? "bg-primary/20 text-primary"
                : "text-gray-400 hover:text-white")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {demoteBlock}

      {tab === "edit" ? (
        <div className="space-y-6">
          <form onSubmit={onSubmit} className="space-y-6">
            <InstructorProfileEditor
              profile={profile}
              setProfile={setProfile}
              photoPreviewUrl={photoPreviewUrl}
              onPhotoFileChange={onPhotoFileChange}
              saveMessage={saveMessage}
            />

            <div className="flex items-center justify-between max-w-md gap-4 rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-3">
              <label className="text-gray-300 font-medium text-sm">
                Weekly schedule email (Sundays)
              </label>
              <input
                type="checkbox"
                checked={!!profile.newsletter_opt_in}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    newsletter_opt_in: e.target.checked,
                  })
                }
                className="w-5 h-5 accent-yellow-400"
              />
            </div>

            <button
              type="submit"
              disabled={updating}
              className="btn-signup w-full py-2 rounded-md"
            >
              {updating ? "Saving…" : "Save changes"}
            </button>
          </form>

          {isCcs && profile.scheduling_enabled && (
            <div
              id="section-ccsBooking-tools"
              className="space-y-6 border-t border-neutral-700 pt-8 scroll-mt-24"
            >
              <h3 className="text-lg font-semibold text-primary">
                Manage lesson slots
              </h3>
              <p className="text-sm text-gray-400">
                Set when students can book you on the CCS calendar.
              </p>
              <div className="overflow-x-auto min-w-0">
                <InstructorSlotManager instructorId={profile.id} />
              </div>
              <div className="overflow-x-auto min-w-0">
                <h4 className="text-base font-semibold text-primary mb-4 text-center">
                  Public calendar preview
                </h4>
                <InstructorLessonCalendar
                  instructorId={profile.id}
                  isInstructorView
                />
              </div>
            </div>
          )}

          <div className="border-t border-neutral-700 pt-8">
            <h3 className="text-lg font-semibold text-primary mb-4">
              Account settings
            </h3>
            {childrenAccountSettings}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 text-center">
            This is how students see your profile. Unsaved edits are reflected
            here before you save.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            {links.team && (
              <Link
                href={links.team}
                target="_blank"
                className="text-sm font-medium text-primary hover:underline"
              >
                Open CCS Team profile →
              </Link>
            )}
            <Link
              href={links.directory}
              target="_blank"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open Find Instructors profile →
            </Link>
          </div>

          <InstructorProfileView
            profile={previewProfile}
            fromDirectory={!isCcs}
            embeddedPreview
            hideBookingCalendar={!profile.scheduling_enabled}
          />

          <PreviewLegend />
        </div>
      )}
    </div>
  );
}

function PreviewLegend() {
  const keys = Object.keys(SHOWN_ON_LABELS) as ProfileShownOn[];
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4 text-xs text-gray-400">
      <p className="font-medium text-gray-300 mb-2">Where profile fields appear</p>
      <ul className="space-y-1">
        {keys.map((k) => (
          <li key={k}>
            <span className="text-gray-500">{SHOWN_ON_LABELS[k]}:</span>{" "}
            fields tagged in Edit with this destination
          </li>
        ))}
      </ul>
    </div>
  );
}
