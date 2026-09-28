"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ProfileAccountSettings from "@/components/profile/ProfileAccountSettings";
import ProfileInstructorTabs from "@/components/profile/ProfileInstructorTabs";
import { isInstructorLikeRole } from "@/lib/instructorProfileFields";

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
  private_lesson_disclaimer: string | null;
  scheduling_enabled: boolean | null;
  accepting_new_students: boolean | null;
  prayer: string | null;
  state: string | null;
  zip_code: string | null;
  newsletter_opt_in?: boolean;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [updating, setUpdating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [emailUpdating, setEmailUpdating] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [activatingInstructor, setActivatingInstructor] = useState(false);
  const [demotingToAttendee, setDemotingToAttendee] = useState(false);
  const [testNewsletterSending, setTestNewsletterSending] = useState(false);
  const [testNewsletterMessage, setTestNewsletterMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const photoPreviewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return profile?.photo_url ?? null;
  }, [file, profile?.photo_url]);

  useEffect(() => {
    return () => {
      if (file && photoPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [file, photoPreviewUrl]);

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
    setSaveMessage(null);

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

    const updateData: Record<string, unknown> = {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      role: profile.role,
    };

    if (profile.role !== "attendee") {
      updateData.photo_url = photo_url ?? null;
    }

    updateData.newsletter_opt_in = profile.newsletter_opt_in ?? false;

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
      updateData.accepting_new_students =
        profile.accepting_new_students === true;
      updateData.state = profile.state ?? null;
      updateData.zip_code = profile.zip_code ?? null;
      updateData.prayer = profile.prayer ?? null;
      if (profile.role === "instructor" || profile.role === "admin") {
        updateData.scheduling_enabled = profile.scheduling_enabled ?? false;
        updateData.private_lesson_disclaimer =
          profile.private_lesson_disclaimer ?? null;
      }
    }

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      setUpdating(false);
      setSaveMessage({
        type: "error",
        text: "Session expired. Please sign in again.",
      });
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
      setFile(null);
      if (photo_url !== profile.photo_url) {
        setProfile({ ...profile, photo_url });
      }
      setSaveMessage({ type: "success", text: "Profile saved successfully." });
    } else {
      const err = await res.json().catch(() => ({}));
      setSaveMessage({
        type: "error",
        text: String(err.error ?? res.statusText),
      });
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 6) {
      setPasswordMessage({
        type: "error",
        text: "Password must be at least 6 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setPasswordUpdating(true);
    const { error } = await supabaseBrowser.auth.updateUser({
      password: newPassword,
    });
    setPasswordUpdating(false);
    if (error) {
      setPasswordMessage({ type: "error", text: error.message });
      return;
    }
    setPasswordMessage({
      type: "success",
      text: "Password updated successfully.",
    });
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMessage(null);
    const trimmed = newEmail.trim();
    const confirmTrimmed = confirmNewEmail.trim();
    if (!trimmed) {
      setEmailMessage({
        type: "error",
        text: "Please enter a new email address.",
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMessage({
        type: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }
    if (trimmed !== confirmTrimmed) {
      setEmailMessage({
        type: "error",
        text: "New email and confirmation do not match.",
      });
      return;
    }
    if (trimmed === profile?.email) {
      setEmailMessage({
        type: "error",
        text: "New email is the same as your current email.",
      });
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
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
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
    if (!profile || (profile.role ?? "").toLowerCase() !== "non-ccs-instructor")
      return;
    if (
      !confirm(
        "Remove your listing from the instructor directory? Your profile info will be kept but you will no longer appear on the Find Instructors page. You can add yourself back anytime."
      )
    )
      return;
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
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

  const accountSettings = profile ? (
    <ProfileAccountSettings
      profile={profile}
      newPassword={newPassword}
      setNewPassword={setNewPassword}
      confirmPassword={confirmPassword}
      setConfirmPassword={setConfirmPassword}
      passwordUpdating={passwordUpdating}
      passwordMessage={passwordMessage}
      onPasswordSubmit={handlePasswordChange}
      newEmail={newEmail}
      setNewEmail={setNewEmail}
      confirmNewEmail={confirmNewEmail}
      setConfirmNewEmail={setConfirmNewEmail}
      emailUpdating={emailUpdating}
      emailMessage={emailMessage}
      onEmailSubmit={handleEmailChange}
      testNewsletterSending={testNewsletterSending}
      testNewsletterMessage={testNewsletterMessage}
      onTestNewsletter={async () => {
        setTestNewsletterMessage(null);
        setTestNewsletterSending(true);
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setTestNewsletterMessage({ type: "error", text: "Not signed in." });
          setTestNewsletterSending(false);
          return;
        }
        const res = await fetch("/api/newsletter/send-test", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        setTestNewsletterSending(false);
        if (res.ok) {
          setTestNewsletterMessage({
            type: "success",
            text: `Test email sent to ${data.sentTo ?? "your email"}.`,
          });
        } else {
          setTestNewsletterMessage({
            type: "error",
            text: data.error ?? "Failed to send test.",
          });
        }
      }}
      onSignOut={handleSignOut}
    />
  ) : null;

  if (loading)
    return <p className="text-gray-400 text-center mt-10">Loading...</p>;
  if (!profile)
    return (
      <p className="text-gray-400 text-center mt-10">
        No profile found. Please sign in.
      </p>
    );

  return (
    <div className="max-w-3xl mx-auto mt-6 sm:mt-12 bg-neutral-800 p-4 sm:p-8 rounded-lg text-white shadow-[0_0_25px_rgba(187,134,252,0.4)] space-y-6">
      <h2 className="text-2xl font-bold text-primary text-center">
        Edit Your Profile
      </h2>

      {isAttendee && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-center">
          <p className="text-gray-300 mb-3">
            List yourself as an instructor in the CCS directory and create a
            public profile.
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

      {isInstructorLikeRole(profile.role) ? (
        <ProfileInstructorTabs
          profile={profile}
          setProfile={setProfile}
          photoPreviewUrl={photoPreviewUrl}
          onPhotoFileChange={setFile}
          onSubmit={handleUpdate}
          updating={updating}
          saveMessage={saveMessage}
          demoteBlock={
            (profile.role ?? "").toLowerCase() === "non-ccs-instructor" ? (
              <div className="rounded-lg border border-neutral-600 bg-neutral-700/30 p-4 text-center">
                <p className="text-gray-300 mb-3">
                  Remove your listing from the Find Instructors page. Your info
                  is kept; you can add yourself back anytime.
                </p>
                <button
                  type="button"
                  onClick={handleRemoveFromInstructorDirectory}
                  disabled={demotingToAttendee}
                  className="px-6 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500 text-white disabled:opacity-50"
                >
                  {demotingToAttendee
                    ? "Updating..."
                    : "Remove from instructor directory"}
                </button>
              </div>
            ) : undefined
          }
          childrenAccountSettings={accountSettings}
        />
      ) : (
        <>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={profile.first_name || ""}
                onChange={(e) =>
                  setProfile({ ...profile, first_name: e.target.value })
                }
                placeholder="First Name"
                className="w-full sm:w-1/2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
              />
              <input
                type="text"
                value={profile.last_name || ""}
                onChange={(e) =>
                  setProfile({ ...profile, last_name: e.target.value })
                }
                placeholder="Last Name"
                className="w-full sm:w-1/2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
              />
            </div>
            <div className="flex items-center justify-between max-w-md gap-4">
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
            {saveMessage && (
              <p
                className={
                  "text-sm " +
                  (saveMessage.type === "success"
                    ? "text-green-400"
                    : "text-red-400")
                }
              >
                {saveMessage.text}
              </p>
            )}
            <button
              type="submit"
              disabled={updating}
              className="btn-signup w-full py-2 rounded-md"
            >
              {updating ? "Updating..." : "Save Changes"}
            </button>
          </form>
          <div className="border-t border-neutral-700 pt-8">
            <h3 className="text-lg font-semibold text-primary mb-4">
              Account settings
            </h3>
            {accountSettings}
          </div>
        </>
      )}
    </div>
  );
}
