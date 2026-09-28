"use client";

import {
  directoryReadinessChecklist,
  isDirectoryListingReady,
  isNonCcsInstructor,
  type EditableInstructorProfile,
} from "@/lib/instructorProfileFields";

export default function ProfileDirectoryChecklist({
  profile,
}: {
  profile: EditableInstructorProfile;
}) {
  if (!isNonCcsInstructor(profile.role)) return null;

  const items = directoryReadinessChecklist(profile);
  const ready = isDirectoryListingReady(profile);

  return (
    <div
      className={
        "rounded-lg border p-4 " +
        (ready
          ? "border-green-500/40 bg-green-500/10"
          : "border-amber-500/40 bg-amber-500/10")
      }
    >
      <h3 className="text-sm font-semibold text-white mb-2">
        Find Instructors directory
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        {ready
          ? "Your profile meets the requirements to appear in Find Instructors after you save."
          : "Add the items below so you can appear on the Find Instructors page (name plus photo or full bio)."}
      </p>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span
              className={
                item.ok ? "text-green-400" : item.optional ? "text-gray-500" : "text-amber-400"
              }
              aria-hidden
            >
              {item.ok ? "✓" : item.optional ? "○" : "!"}
            </span>
            <a
              href={`#section-${item.sectionId}`}
              className="text-gray-300 hover:text-primary underline-offset-2 hover:underline"
            >
              {item.label}
              {item.optional ? " (optional)" : ""}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
