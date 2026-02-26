"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [updating, setUpdating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleHashAndSession = async () => {
      // Get the hash from the URL (handles both # and %23 encoded)
      let hash = typeof window !== "undefined" ? window.location.hash : "";
      if (typeof window !== "undefined" && !hash && window.location.href.includes("%23")) {
        hash = decodeURIComponent(window.location.href.split("%23")[1] || "");
        if (hash && !hash.startsWith("#")) {
          hash = "#" + hash;
        }
      }

      const hashParams = hash && hash.length > 1 ? new URLSearchParams(hash.substring(1)) : null;
      const accessToken = hashParams?.get("access_token");
      const refreshToken = hashParams?.get("refresh_token");
      const error = hashParams?.get("error");
      const errorDescription = hashParams?.get("error_description");

      if (error) {
        setStatus("error");
        setMessage(errorDescription || error || "Invalid or expired reset link.");
        return;
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabaseBrowser.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          setStatus("error");
          setMessage(sessionError.message);
          return;
        }
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
        setStatus("ready");
        return;
      }

      // No hash: check if we already have a session (e.g. user refreshed after landing from email)
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (session) {
        setStatus("ready");
        return;
      }

      // No session and no tokens: send user to login
      if (typeof window !== "undefined") {
        window.location.href = "/auth";
        return;
      }
      setStatus("error");
      setMessage("No reset link found.");
    };

    handleHashAndSession();
  }, []);

  useEffect(() => {
    if (status === "error") return;
    if (status === "loading") return;
    // If we have a session but landed without hash, we're ready; no redirect needed.
    // If no session and no tokens, we already set error above.
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    setUpdating(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password: newPassword });
    setUpdating(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setStatus("success");
    setTimeout(() => router.push("/"), 2000);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="max-w-sm mx-auto bg-neutral-800 p-6 rounded-lg text-white shadow-lg text-center">
          <div className="mx-auto h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-300">Setting up password reset...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg text-center">
        <h2 className="text-2xl font-bold mb-4 text-red-500">Reset link invalid</h2>
        <p className="text-gray-300 mb-6">{message}</p>
        <Link href="/auth" className="block w-full btn-signup py-3 text-center font-semibold">
          Back to sign in
        </Link>
        <Link href="/auth" className="block mt-4 text-accent hover:text-[#CF9FFF] text-sm">
          ← Request a new reset link
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg text-center">
        <h2 className="text-2xl font-bold mb-4 text-primary">Password updated</h2>
        <p className="text-gray-300 mb-4">You can now sign in with your new password.</p>
        <p className="text-sm text-gray-500">Redirecting to home...</p>
        <Link href="/" className="block mt-4 text-accent hover:text-[#CF9FFF]">
          Go to home now
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-primary">Set new password</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setPasswordError("");
          }}
          autoComplete="new-password"
          minLength={6}
          required
        />
        <input
          className={`w-full px-3 py-2 rounded bg-neutral-900 border ${
            passwordError ? "border-red-500" : "border-neutral-700"
          }`}
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setPasswordError("");
          }}
          autoComplete="new-password"
          minLength={6}
          required
        />
        {passwordError && (
          <p className="text-red-500 text-sm">{passwordError}</p>
        )}
        <button disabled={updating} type="submit" className="btn-signup w-full">
          {updating ? "Updating..." : "Update password"}
        </button>
      </form>
      <Link href="/auth" className="block mt-4 text-accent hover:text-[#CF9FFF] text-sm">
        ← Back to sign in
      </Link>
    </div>
  );
}
