"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
}

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.user) {
        setIsAdmin(false);
        setAuthToken(null);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setIsAdmin(false);
        setAuthToken(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      const roleLower = (data.profile?.role || "").toLowerCase();
      setIsAdmin(roleLower === "admin");
      setAuthToken(roleLower === "admin" ? session.access_token : null);
      setLoading(false);
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!isAdmin || !authToken) {
      setProfiles([]);
      return;
    }
    const load = async () => {
      setError(null);
      const res = await fetch("/api/admin/profiles", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string })?.error ?? "Failed to load profiles");
        setProfiles([]);
        return;
      }
      const data = await res.json();
      setProfiles((data.profiles as ProfileRow[]) ?? []);
    };
    load();
  }, [isAdmin, authToken]);

  const setNonCCSInstructor = async (profileId: string, enable: boolean) => {
    if (!authToken) return;
    setTogglingId(profileId);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        profile_id: profileId,
        role: enable ? "non-ccs-instructor" : "attendee",
      }),
    });
    setTogglingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert("Failed to update role: " + (body as { error?: string })?.error);
      return;
    }
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === profileId
          ? { ...p, role: enable ? "non-ccs-instructor" : "attendee" }
          : p
      )
    );
  };

  const renderNonCCSToggle = (p: ProfileRow) => {
    const isNonCCS = (p.role ?? "").toLowerCase() === "non-ccs-instructor";
    const busy = togglingId === p.id;
    return (
      <button
        type="button"
        onClick={() => setNonCCSInstructor(p.id, !isNonCCS)}
        disabled={busy}
        className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-medium transition ${
          isNonCCS
            ? "bg-primary/20 text-primary ring-1 ring-primary/40 hover:bg-primary/30"
            : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200"
        } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {busy ? "Updating…" : isNonCCS ? "On" : "Off"}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-center text-neutral-400">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">Access denied</h1>
        <p className="mb-6 text-neutral-400">This page is for administrators only.</p>
        <Link
          href="/"
          className="inline-block rounded-md bg-primary px-4 py-2 font-medium text-black transition hover:bg-primary/90"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">User roles</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Admin-only • Set or remove Non-CCS-Instructor for the directory
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/finances"
            className="text-sm text-neutral-400 transition hover:text-primary"
          >
            Event finances
          </Link>
          <Link
            href="/"
            className="text-sm text-neutral-400 transition hover:text-primary"
          >
            ← Back to site
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-400">
          {error}
        </div>
      )}

      <div className="md:hidden space-y-3">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-4 space-y-3"
          >
            <div>
              <p className="font-medium text-neutral-200">
                {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
              </p>
              <p className="text-sm text-neutral-400 break-all">{p.email ?? "—"}</p>
              <p className="mt-1 text-sm text-neutral-300">Role: {p.role ?? "—"}</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Non-CCS-Instructor</span>
              {renderNonCCSToggle(p)}
            </div>
          </div>
        ))}
        {profiles.length === 0 && !error && (
          <p className="py-8 text-center text-neutral-500">No profiles found.</p>
        )}
      </div>

      <div className="hidden md:block overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-900/50">
                <th className="px-4 py-3 font-medium text-primary">Name</th>
                <th className="px-4 py-3 font-medium text-primary">Email</th>
                <th className="px-4 py-3 font-medium text-primary">Role</th>
                <th className="px-4 py-3 font-medium text-primary">Non-CCS-Instructor</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-neutral-700/80 last:border-0 hover:bg-neutral-800/50"
                >
                  <td className="px-4 py-3 text-neutral-200">
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{p.email ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-300">{p.role ?? "—"}</td>
                  <td className="px-4 py-3">{renderNonCCSToggle(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profiles.length === 0 && !error && (
          <p className="px-4 py-8 text-center text-neutral-500">No profiles found.</p>
        )}
      </div>
    </div>
  );
}
