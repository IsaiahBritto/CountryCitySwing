"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import InstructorSlotManager from "@/components/InstructorSlotManager";

// Dynamically load client-side only
const InstructorLessonCalendar = dynamic(
  () => import("@/components/InstructorLessonCalendar"),
  { ssr: false }
);

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  email: string;
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
  scheduling_enabled: boolean | null;
  lesson_duration_minutes: number | null;
  prayer: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user) return setLoading(false);

      const { data } = await supabaseBrowser
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile({ ...data, email: user.email });
      setLoading(false);
    }

    loadProfile();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setUpdating(true);

    // Upload new profile photo if one is chosen
    let photo_url = profile.photo_url;
    if (file) {
      const { data, error } = await supabaseBrowser.storage
        .from("photos")
        .upload(`profiles/${profile.id}_${Date.now()}.jpg`, file, {
          upsert: true,
        });
      if (!error) {
        const {
          data: { publicUrl },
        } = supabaseBrowser.storage.from("photos").getPublicUrl(data.path);
        photo_url = publicUrl;
      }
    }

    const { error } = await supabaseBrowser
      .from("profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        photo_url,
        instagram_url: profile.instagram_url,
        teaching_since: profile.teaching_since,
        favorite_song: profile.favorite_song,
        teaching_style: profile.teaching_style,
        bio_long: profile.bio_long,
        specialty: profile.specialty,
        phone_number: profile.phone_number,
        private_lessons: profile.private_lessons,
        private_lessons_link: profile.private_lessons_link,
        scheduling_enabled: profile.scheduling_enabled,
        lesson_duration_minutes: profile.lesson_duration_minutes,
      })
      .eq("id", profile.id);

    setUpdating(false);

    if (!error) {
      alert("Profile updated successfully!");
    } else {
      alert("Error updating profile: " + error.message);
    }
  };

  const handleSignOut = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/";
  };

  if (loading)
    return <p className="text-gray-400 text-center mt-10">Loading...</p>;
  if (!profile)
    return (
      <p className="text-gray-400 text-center mt-10">
        No profile found. Please sign in.
      </p>
    );

  return (
    <div className="max-w-3xl mx-auto mt-12 bg-neutral-800 p-8 rounded-lg text-white shadow-[0_0_25px_rgba(187,134,252,0.4)] space-y-6">
      <h2 className="text-2xl font-bold text-primary text-center">
        Edit Your Profile
      </h2>

      {/* Profile Photo */}
      {profile.photo_url && (
        <img
          src={profile.photo_url}
          alt="Profile photo"
          className="w-28 h-28 rounded-full mx-auto border border-yellow-400 object-cover"
        />
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block mx-auto text-sm text-gray-300 mt-2"
      />

      {/* Editable Form */}
      <form onSubmit={handleUpdate} className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={profile.first_name || ""}
            onChange={(e) =>
              setProfile({ ...profile, first_name: e.target.value })
            }
            placeholder="First Name"
            className="w-1/2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          />
          <input
            type="text"
            value={profile.last_name || ""}
            onChange={(e) =>
              setProfile({ ...profile, last_name: e.target.value })
            }
            placeholder="Last Name"
            className="w-1/2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          />
        </div>

        {/* Instructor-only fields */}
        {profile.role === "instructor" && (
          <>
            <input
              type="text"
              value={profile.prayer || ""}
              onChange={(e) =>
                setProfile({ ...profile, prayer: e.target.value })
              }
              placeholder="Prayer: "
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />
            <textarea
              value={profile.bio_long || ""}
              onChange={(e) =>
                setProfile({ ...profile, bio_long: e.target.value })
              }
              placeholder="Full Bio (share your story!)"
              className="w-full h-28 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 resize-none"
            />

            <input
              type="text"
              value={profile.specialty || ""}
              onChange={(e) =>
                setProfile({ ...profile, specialty: e.target.value })
              }
              placeholder="Specialty (e.g., Country Swing)"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            <input
              type="text"
              value={profile.teaching_style || ""}
              onChange={(e) =>
                setProfile({ ...profile, teaching_style: e.target.value })
              }
              placeholder="Teaching Style"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            <input
              type="date"
              value={profile.teaching_since || ""}
              onChange={(e) =>
                setProfile({ ...profile, teaching_since: e.target.value })
              }
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            <input
              type="text"
              value={profile.favorite_song || ""}
              onChange={(e) =>
                setProfile({ ...profile, favorite_song: e.target.value })
              }
              placeholder="Favorite Song"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            <input
              type="text"
              value={profile.instagram_url || ""}
              onChange={(e) =>
                setProfile({ ...profile, instagram_url: e.target.value })
              }
              placeholder="Instagram URL"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            <input
              type="text"
              value={profile.phone_number || ""}
              onChange={(e) =>
                setProfile({ ...profile, phone_number: e.target.value })
              }
              placeholder="Phone Number"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            <textarea
              value={profile.private_lessons || ""}
              onChange={(e) =>
                setProfile({ ...profile, private_lessons: e.target.value })
              }
              placeholder="Private Lessons Info"
              className="w-full h-24 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 resize-none"
            />

            <input
              type="text"
              value={profile.private_lessons_link || ""}
              onChange={(e) =>
                setProfile({ ...profile, private_lessons_link: e.target.value })
              }
              placeholder="Private Lessons Schedule Link"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            />

            {/* Scheduling Toggle */}
            <div className="flex items-center justify-between mt-6">
              <label className="text-gray-300 font-medium">
                Enable scheduling through CCS website
              </label>
              <input
                type="checkbox"
                checked={!!profile.scheduling_enabled}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    scheduling_enabled: e.target.checked,
                  })
                }
                className="w-5 h-5 accent-yellow-400"
              />
            </div>

            {/* Lesson Duration */}
            {profile.scheduling_enabled && (
              <div className="mt-3">
                <label className="text-gray-300 font-medium">
                  Lesson Duration (minutes)
                </label>
                <select
                  value={profile.lesson_duration_minutes || 60}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      lesson_duration_minutes: Number(e.target.value),
                    })
                  }
                  className="block w-32 mt-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                >
                  <option value={45}>45</option>
                  <option value={60}>60</option>
                </select>
              </div>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={updating}
          className="btn-signup w-full py-2 rounded-md mt-4"
        >
          {updating ? "Updating..." : "Save Changes"}
        </button>
      </form>

      {/* Slot Manager (only for instructors who enabled scheduling) */}
      {profile.role === "instructor" && profile.scheduling_enabled && (
        <InstructorSlotManager instructorId={profile.id} />
      )}

      {profile.role === "instructor" && profile.scheduling_enabled && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold text-primary mb-4 text-center">
            Your Public Lesson Calendar Preview
          </h3>
          <InstructorLessonCalendar instructorId={profile.id} isInstructorView={true} />
        </div>
      )}

      {/* Sign Out */}
      <div className="text-center mt-6">
        <button
          onClick={handleSignOut}
          className="w-full py-2 rounded-md font-semibold transition-all duration-300
             bg-transparent border border-red-500 text-red-400
             shadow-[0_0_15px_rgba(239,68,68,0.4)]
             hover:bg-red-500 hover:text-black
             hover:shadow-[0_0_25px_rgba(239,68,68,0.8)]"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
