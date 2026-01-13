"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  photo_url: string | null;
  email: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user) return;

      const { data: profiles } = await supabaseBrowser
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile({ ...profiles, email: user.email });
      setLoading(false);
    }

    loadProfile();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    // Upload photo if present
    let photo_url = profile.photo_url;
    if (file) {
      const { data, error } = await supabaseBrowser.storage
        .from("photos")
        .upload(`profiles/${profile.id}.jpg`, file, {
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
      })
      .eq("id", profile.id);

    if (!error) alert("Profile updated!");
  };

  const handleEmailPasswordUpdate = async () => {
    const newEmail = prompt("Enter new email:");
    const newPassword = prompt("Enter new password (optional):");
    const updates: any = {};
    if (newEmail) updates.email = newEmail;
    if (newPassword) updates.password = newPassword;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseBrowser.auth.updateUser(updates);
      if (!error) alert("Email/Password updated!");
    }
  };

  if (loading) return <p className="text-gray-400 text-center mt-10">Loading...</p>;
  if (!profile) return <p className="text-gray-400 text-center mt-10">No profile found.</p>;

  return (
    <div className="max-w-md mx-auto mt-12 bg-neutral-800 p-6 rounded-lg text-white shadow-lg space-y-4">
      <h2 className="text-2xl font-bold text-primary mb-4 text-center">
        Your Profile
      </h2>

      {profile.photo_url && (
        <img
          src={profile.photo_url}
          alt="Profile photo"
          className="w-24 h-24 rounded-full mx-auto mb-3 object-cover border border-yellow-400"
        />
      )}

      <form onSubmit={handleUpdate} className="space-y-3">
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

        {profile.role === "instructor" && (
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-300"
          />
        )}

        <button
          type="submit"
          className="btn-signup w-full text-center mt-3"
        >
          Save Profile
        </button>
      </form>

      <div className="text-center mt-4 space-y-2">
        <p className="text-gray-300">Role: <strong>{profile.role}</strong></p>
        <button
          onClick={handleEmailPasswordUpdate}
          className="text-primary hover:text-yellow-300 text-sm"
        >
          Update Email / Password
        </button>
      </div>
    </div>
  );
}
