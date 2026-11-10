"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { LEGAL_CONTACT_EMAIL, LEGAL_PRIVACY_EMAIL } from "@/lib/legal/constants";

export default function SettingsPageClient() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
      setLoading(false);
    });
  }, []);

  const deleteAccount = async () => {
    setMessage(null);
    const confirmed = window.confirm(
      "Delete your account permanently? You will lose access to your profile and related data. This cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setMessage({ type: "error", text: "You must be signed in." });
        return;
      }
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Delete failed");
      }
      await supabaseBrowser.auth.signOut();
      router.push("/?account_deleted=1");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete account",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center">Loading…</p>;
  }

  return (
    <section className="max-w-xl mx-auto text-neutral-100 space-y-10">
      <div className="text-center">
        <h1 className="page-title font-semibold text-primary mb-2">Settings</h1>
        <p className="text-gray-400 text-sm">Privacy, data, and account</p>
      </div>

      <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Privacy</h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          Review our{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          ,{" "}
          <Link href="/terms" className="text-primary underline">
            Terms
          </Link>
          , and{" "}
          <Link href="/cookies" className="text-primary underline">
            Cookie Policy
          </Link>
          . Update your profile or newsletter preferences on{" "}
          <Link href="/profile" className="text-primary underline">
            Profile
          </Link>
          .
        </p>
        <p className="text-sm text-gray-300">
          To request access, correction, or deletion of data not covered by self-service tools, email{" "}
          <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`} className="text-primary underline">
            {LEGAL_PRIVACY_EMAIL}
          </a>{" "}
          from {email ? <strong>{email}</strong> : "your account email"}.
        </p>
      </div>

      <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-red-200">Delete account</h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          Permanently delete your login and profile. Event registrations and orders tied to your email
          may be retained for operational and legal records; contact{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary underline">
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          for additional erasure requests.
        </p>
        {message && (
          <p
            className={`text-sm ${message.type === "success" ? "text-green-400" : "text-red-400"}`}
            role="alert"
          >
            {message.text}
          </p>
        )}
        <button
          type="button"
          disabled={deleting || !email}
          onClick={() => void deleteAccount()}
          className="rounded-lg border border-red-500 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </section>
  );
}
