"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

    // Upload photo if a new file is selected
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
        // Instructor-specific fields
        instagram_url: profile.instagram_url,
        teaching_since: profile.teaching_since,
        favorite_song: profile.favorite_song,
        teaching_style: profile.teaching_style,
        bio_long: profile.bio_long,
        specialty: profile.specialty,
        phone_number: profile.phone_number,
        private_lessons: profile.private_lessons,
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
    <div className="max-w-2xl mx-auto mt-12 bg-neutral-800 p-8 rounded-lg text-white shadow-[0_0_25px_rgba(187,134,252,0.4)] space-y-6">
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
              value={profile.specialty || ""}
              onChange={(e) =>
                setProfile({ ...profile, specialty: e.target.value })
              }
              placeholder="Specialty (e.g., Country Swing)"
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
