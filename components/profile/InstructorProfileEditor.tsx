"use client";

import GoldToggle from "@/components/GoldToggle";
import ProfileDirectoryChecklist from "@/components/profile/ProfileDirectoryChecklist";
import ProfileField from "@/components/profile/ProfileField";
import {
  INSTRUCTOR_PROFILE_SECTIONS,
  isCcsCoreInstructor,
  type InstructorFieldKey,
  type InstructorProfileFormState,
} from "@/lib/instructorProfileFields";
import { US_STATES_FULL_NAMES } from "@/lib/utils/usStates";

function getFieldValue(
  profile: InstructorProfileFormState,
  key: InstructorFieldKey
): string {
  const v = profile[key];
  if (key === "accepting_new_students" || key === "scheduling_enabled") {
    return "";
  }
  if (v === null || v === undefined) return "";
  return String(v);
}

function setFieldValue(
  profile: InstructorProfileFormState,
  key: InstructorFieldKey,
  value: string
): InstructorProfileFormState {
  if (key === "accepting_new_students" || key === "scheduling_enabled") {
    return profile;
  }
  if (key === "state" || key === "zip_code") {
    return { ...profile, [key]: value.trim() || null };
  }
  return { ...profile, [key]: value || null };
}

export default function InstructorProfileEditor({
  profile,
  setProfile,
  photoPreviewUrl,
  onPhotoFileChange,
  saveMessage,
}: {
  profile: InstructorProfileFormState;
  setProfile: React.Dispatch<
    React.SetStateAction<InstructorProfileFormState>
  >;
  photoPreviewUrl: string | null;
  onPhotoFileChange: (file: File | null) => void;
  saveMessage: { type: "success" | "error"; text: string } | null;
}) {
  const sections = INSTRUCTOR_PROFILE_SECTIONS.filter(
    (s) => !s.ccsInstructorOnly || isCcsCoreInstructor(profile.role)
  );

  return (
    <div className="space-y-8">
      <ProfileDirectoryChecklist profile={profile} />

      {saveMessage && (
        <p
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (saveMessage.type === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-300"
              : "border-red-500/40 bg-red-500/10 text-red-300")
          }
          role="status"
        >
          {saveMessage.text}
        </p>
      )}

      {sections.map((section) => (
        <section
          key={section.id}
          id={`section-${section.id}`}
          className="scroll-mt-24 space-y-4 border-t border-neutral-700 pt-6 first:border-t-0 first:pt-0"
        >
          <div>
            <h3 className="text-lg font-semibold text-primary">{section.title}</h3>
            <p className="text-sm text-gray-400 mt-1">{section.description}</p>
          </div>

          {section.id === "publicProfile" && (
            <div className="space-y-2">
              <span className="block text-sm font-medium text-gray-200">
                Profile photo
              </span>
              {photoPreviewUrl && (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="w-28 h-28 rounded-full border border-yellow-400 object-cover"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  onPhotoFileChange(e.target.files?.[0] ?? null)
                }
                className="block text-sm text-gray-300"
              />
              <p className="text-xs text-gray-400">
                Circular photo on your full profile; smaller thumbnail in Find
                Instructors.
              </p>
              <p className="text-xs text-gray-500">
                Shown on: Full profile page · Find Instructors list · CCS Team
                card · Map (with location)
              </p>
            </div>
          )}

          {section.id === "publicProfile" && (
            <div className="flex flex-col sm:flex-row gap-4">
              {(["first_name", "last_name"] as const).map((key) => {
                const field = section.fields.find((f) => f.key === key)!;
                return (
                  <div key={key} className="flex-1">
                    <ProfileField
                      field={field}
                      value={profile[key] ?? ""}
                      onChange={(v) => setProfile({ ...profile, [key]: v })}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {section.fields.map((field) => {
            if (field.key === "first_name" || field.key === "last_name") {
              return null;
            }

            if (field.key === "state") {
              return (
                <div key={field.key} className="space-y-1">
                  <label
                    htmlFor="profile-state"
                    className="block text-sm font-medium text-gray-200"
                  >
                    {field.label}
                  </label>
                  <select
                    id="profile-state"
                    value={profile.state || ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        state: e.target.value || null,
                      })
                    }
                    className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                  >
                    <option value="">Select state (optional)</option>
                    {US_STATES_FULL_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">{field.help}</p>
                  <p className="text-xs text-gray-500">
                    Shown on: Find Instructors list · Map
                  </p>
                </div>
              );
            }

            if (field.inputType === "toggle") {
              return (
                <div
                  key={field.key}
                  className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-4"
                >
                  <GoldToggle
                    checked={!!profile.accepting_new_students}
                    onChange={(checked) =>
                      setProfile({
                        ...profile,
                        accepting_new_students: checked,
                      })
                    }
                    label={field.label}
                    description={field.help}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Shown on: Full profile page · Find Instructors list
                  </p>
                </div>
              );
            }

            if (field.inputType === "checkbox") {
              return (
                <div key={field.key} className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-200">
                      {field.label}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{field.help}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Shown on: Full profile page
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!profile.scheduling_enabled}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        scheduling_enabled: e.target.checked,
                      })
                    }
                    className="w-5 h-5 accent-yellow-400 mt-1"
                    aria-label={field.label}
                  />
                </div>
              );
            }

            if (field.key === "private_lesson_disclaimer") {
              return (
                <ProfileField
                  key={field.key}
                  field={field}
                  value={profile.private_lesson_disclaimer ?? ""}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      private_lesson_disclaimer: v || null,
                    })
                  }
                />
              );
            }

            return (
              <ProfileField
                key={field.key}
                field={field}
                value={getFieldValue(profile, field.key)}
                onChange={(v) => setProfile(setFieldValue(profile, field.key, v))}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
