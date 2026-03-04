"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import InstructorSlotManager from "@/components/InstructorSlotManager";
import { US_STATES_FULL_NAMES } from "@/lib/utils/usStates";

// Dynamically load client-side only
const InstructorLessonCalendar = dynamic(
  () => import("@/components/InstructorLessonCalendar"),
  { ssr: false }
);

function isInstructorLikeRole(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "instructor" || r === "non-ccs-instructor" || r.includes("instructor");
}

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
  prayer: string | null;
  state: string | null;
  zip_code: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [updating, setUpdating] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [emailUpdating, setEmailUpdating] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activatingInstructor, setActivatingInstructor] = useState(false);
  const [demotingToAttendee, setDemotingToAttendee] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session?.user) return setLoading(false);

      const token = session.access_token;
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      setProfile({ ...data, email: session.user.email ?? "" });
      setLoading(false);
    }

    loadProfile();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setUpdating(true);

    // Upload new profile photo if one is chosen (only for non-attendee users)
    let photo_url = profile.photo_url;
    if (file && profile.role !== "attendee") {
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

    // Build update payload: include every editable field so the API saves all of them
    const updateData: Record<string, unknown> = {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      role: profile.role,
    };

    if (profile.role !== "attendee") {
      updateData.photo_url = photo_url ?? null;
    }

    if (isInstructorLikeRole(profile.role)) {
      updateData.instagram_url = profile.instagram_url ?? null;
      updateData.teaching_since = profile.teaching_since ?? null;
      updateData.favorite_song = profile.favorite_song ?? null;
      updateData.teaching_style = profile.teaching_style ?? null;
      updateData.bio_long = profile.bio_long ?? null;
      updateData.specialty = profile.specialty ?? null;
      updateData.phone_number = profile.phone_number ?? null;
      updateData.private_lessons = profile.private_lessons ?? null;
      updateData.private_lessons_link = profile.private_lessons_link ?? null;
      updateData.state = profile.state ?? null;
      updateData.zip_code = profile.zip_code ?? null;
      updateData.prayer = profile.prayer ?? null;
      if (profile.role === "instructor" || profile.role === "admin") {
        updateData.scheduling_enabled = profile.scheduling_enabled ?? false;
      }
    }

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      setUpdating(false);
      alert("Session expired. Please sign in again.");
      return;
    }

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updateData),
    });

    setUpdating(false);

    if (res.ok) {
      alert("Profile updated successfully!");
    } else {
      const err = await res.json().catch(() => ({}));
      alert("Error updating profile: " + (err.error ?? res.statusText));
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setPasswordUpdating(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password: newPassword });
    setPasswordUpdating(false);
    if (error) {
      setPasswordMessage({ type: "error", text: error.message });
      return;
    }
    setPasswordMessage({ type: "success", text: "Password updated successfully." });
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMessage(null);
    const trimmed = newEmail.trim();
    const confirmTrimmed = confirmNewEmail.trim();
    if (!trimmed) {
      setEmailMessage({ type: "error", text: "Please enter a new email address." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMessage({ type: "error", text: "Please enter a valid email address." });
      return;
    }
    if (trimmed !== confirmTrimmed) {
      setEmailMessage({ type: "error", text: "New email and confirmation do not match." });
      return;
    }
    if (trimmed === profile?.email) {
      setEmailMessage({ type: "error", text: "New email is the same as your current email." });
      return;
    }
    setEmailUpdating(true);
    const { error } = await supabaseBrowser.auth.updateUser({ email: trimmed });
    setEmailUpdating(false);
    if (error) {
      setEmailMessage({ type: "error", text: error.message });
      return;
    }
    setEmailMessage({
      type: "success",
      text: "Check your new email and click the link to confirm the change.",
    });
    setNewEmail("");
    setConfirmNewEmail("");
  };

  const handleSignOut = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/";
  };

  const handleCreateInstructorProfile = async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setActivatingInstructor(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "non-ccs-instructor" }),
    });
    setActivatingInstructor(false);
    if (res.ok && profile) {
      setProfile({ ...profile, role: "non-ccs-instructor" });
    } else {
      const err = await res.json().catch(() => ({}));
      alert("Error: " + (err.error ?? res.statusText));
    }
  };

  const handleRemoveFromInstructorDirectory = async () => {
    if (!profile || (profile.role ?? "").toLowerCase() !== "non-ccs-instructor") return;
    if (!confirm("Remove your listing from the instructor directory? Your profile info will be kept but you will no longer appear on the Find Instructors page. You can add yourself back anytime.")) return;
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setDemotingToAttendee(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "attendee" }),
    });
    setDemotingToAttendee(false);
    if (res.ok && profile) {
      setProfile({ ...profile, role: "attendee" });
    } else {
      const err = await res.json().catch(() => ({}));
      alert("Error: " + (err.error ?? res.statusText));
    }
  };

  const isAttendee =
    profile &&
    (!profile.role ||
      profile.role.trim() === "" ||
      profile.role.toLowerCase() === "attendee");

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
      {/* Only allow photo upload for non-attendee users (includes non-ccs-instructor) */}
      {profile.role !== "attendee" && (
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block mx-auto text-sm text-gray-300 mt-2"
        />
      )}

      {/* Create instructor profile CTA for attendees */}
      {isAttendee && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-center">
          <p className="text-gray-300 mb-3">
            List yourself as an instructor in the CCS directory and create a public profile.
          </p>
          <button
            type="button"
            onClick={handleCreateInstructorProfile}
            disabled={activatingInstructor}
            className="btn-signup px-6 py-2 rounded-md"
          >
            {activatingInstructor ? "Activating..." : "Create instructor profile"}
          </button>
        </div>
      )}

      {/* Remove from instructor directory (non-CCS only) */}
      {(profile.role ?? "").toLowerCase() === "non-ccs-instructor" && (
        <div className="rounded-lg border border-neutral-600 bg-neutral-700/30 p-4 text-center">
          <p className="text-gray-300 mb-3">
            Remove your listing from the Find Instructors page and make your profile a regular account. Your current info will be kept, but you will no longer appear in the instructor directory. You can add yourself back anytime.
          </p>
          <button
            type="button"
            onClick={handleRemoveFromInstructorDirectory}
            disabled={demotingToAttendee}
            className="px-6 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500 text-white disabled:opacity-50"
          >
            {demotingToAttendee ? "Updating..." : "Remove from instructor directory"}
          </button>
        </div>
      )}

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

        {/* Instructor and Non-CCS-Instructor profile fields */}
        {isInstructorLikeRole(profile.role) && (
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

            {/* Location for directory and map */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={profile.state || ""}
                onChange={(e) =>
                  setProfile({ ...profile, state: e.target.value || null })
                }
                className="flex-1 min-w-[140px] px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                aria-label="State"
              >
                <option value="">State (optional)</option>
                {US_STATES_FULL_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={profile.zip_code || ""}
                onChange={(e) =>
                  setProfile({ ...profile, zip_code: e.target.value.trim() || null })
                }
                placeholder="ZIP code (optional)"
                className="w-32 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                maxLength={10}
              />
            </div>

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

            {/* Scheduling Toggle: only for core CCS instructors, not Non-CCS-Instructor */}
            {(profile.role === "instructor" || profile.role === "admin") && (
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

      {/* Change password */}
      <div className="border-t border-neutral-700 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-primary mb-3">Change password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="new-password"
            minLength={6}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="new-password"
            minLength={6}
          />
          {passwordMessage && (
            <p
              className={`text-sm ${passwordMessage.type === "success" ? "text-green-400" : "text-red-400"}`}
            >
              {passwordMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={passwordUpdating}
            className="btn-signup py-2 px-4 rounded-md"
          >
            {passwordUpdating ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>

      {/* Change email */}
      <div className="border-t border-neutral-700 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-primary mb-3">Change email</h3>
        <form onSubmit={handleEmailChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Current email</label>
            <input
              type="email"
              value={profile?.email ?? ""}
              readOnly
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-gray-400 cursor-not-allowed"
              aria-readonly
            />
          </div>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setEmailMessage(null); }}
            placeholder="New email address"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="email"
          />
          <input
            type="email"
            value={confirmNewEmail}
            onChange={(e) => { setConfirmNewEmail(e.target.value); setEmailMessage(null); }}
            placeholder="Confirm new email address"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="email"
          />
          {emailMessage && (
            <p
              className={`text-sm ${emailMessage.type === "success" ? "text-green-400" : "text-red-400"}`}
            >
              {emailMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={emailUpdating}
            className="btn-signup py-2 px-4 rounded-md"
          >
            {emailUpdating ? "Sending..." : "Send confirmation email"}
          </button>
        </form>
      </div>

      {/* Slot Manager (only for instructors who enabled scheduling) */}
      {(profile.role === "instructor" || profile.role === "admin") && profile.scheduling_enabled && (
        <InstructorSlotManager instructorId={profile.id} />
      )}

      {(profile.role === "instructor" || profile.role === "admin") && profile.scheduling_enabled && (
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
