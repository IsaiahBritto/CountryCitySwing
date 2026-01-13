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
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user) return setLoading(false);

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
    const filePath = `profiles/${profile.id}_${Date.now()}.jpg`;

    const { error: uploadError } = await supabaseBrowser.storage
        .from("photos")
        .upload(filePath, file, { upsert: true });

    if (uploadError) {
        console.error("Upload error:", uploadError.message);
        alert("Failed to upload image: " + uploadError.message);
    } else {
        const {
        data: { publicUrl },
        } = supabaseBrowser.storage.from("photos").getPublicUrl(filePath);
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
    setShowModal(true);
  };

  const handleSaveCredentials = async () => {
    if (!newEmail && !newPassword) {
      alert("Please enter an email or password to update.");
      return;
    }
    setUpdating(true);

    const updates: any = {};
    if (newEmail) updates.email = newEmail;
    if (newPassword) updates.password = newPassword;

    const { error } = await supabaseBrowser.auth.updateUser(updates);
    setUpdating(false);

    if (error) {
      alert(error.message);
    } else {
      alert("Credentials updated!");
      setShowModal(false);
      setNewEmail("");
      setNewPassword("");
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
      <p className="text-gray-400 text-center mt-10">No profile found.</p>
    );

  return (
    <div className="max-w-md mx-auto mt-12 bg-neutral-800 p-6 rounded-lg text-white shadow-lg space-y-4">
      <h2 className="text-2xl font-bold text-primary mb-4 text-center">
        Your Profile
      </h2>

      {/* Profile Photo */}
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

        <button type="submit" className="btn-signup w-full text-center mt-3">
          Save Profile
        </button>
      </form>

      {/* Role visible only for instructors */}
      {profile.role === "instructor" && (
        <p className="text-center mt-3 text-gray-300">
          Role: <strong>{profile.role}</strong>
        </p>
      )}

      <div className="text-center mt-4 space-y-3">
        <button
          onClick={handleEmailPasswordUpdate}
          className="text-primary hover:text-yellow-300 text-sm"
        >
          Update Email / Password
        </button>

        <button
          onClick={handleSignOut}
          className="w-full mt-2 py-2 rounded-md font-semibold transition-all duration-300
             bg-transparent border border-red-500 text-red-400
             shadow-[0_0_15px_rgba(239,68,68,0.4)]
             hover:bg-red-500 hover:text-black
             hover:shadow-[0_0_25px_rgba(239,68,68,0.8)]"
        >
          Sign Out
        </button>
      </div>

      {/* ---------- Modal for updating email/password ---------- */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-[90%] max-w-sm shadow-[0_0_25px_rgba(242,201,76,0.6)]"
          >
            <h3 className="text-xl font-semibold text-primary mb-3 text-center">
              Update Account Info
            </h3>

            <div className="space-y-3">
              <input
                type="email"
                placeholder="New Email (optional)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
              />
              <input
                type="password"
                placeholder="New Password (optional)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
              />
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-red-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCredentials}
                disabled={updating}
                className="btn-signup px-4 py-2 rounded-md"
              >
                {updating ? "Updating..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
