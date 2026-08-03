"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/comps/clientAuth";
import { profileDisplayName } from "@/lib/profileUtils";

export interface ProfileResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export default function ProfileSearchPicker({
  label,
  value,
  onChange,
  searchUrl = "/api/comp-signup/profiles",
  excludeProfileId,
  placeholder = "Search by name or email…",
  disabled = false,
}: {
  label: string;
  value: ProfileResult | null;
  onChange: (profile: ProfileResult | null) => void;
  searchUrl?: string;
  excludeProfileId?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (value) {
      setQuery("");
      setResults([]);
      setHasSearched(false);
    }
  }, [value?.id]);

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await authedFetch(
        `${searchUrl}?q=${encodeURIComponent(query.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        let profiles: ProfileResult[] = data.profiles ?? [];
        if (excludeProfileId) {
          profiles = profiles.filter((p) => p.id !== excludeProfileId);
        }
        setResults(profiles);
      } else {
        setResults([]);
      }
      setHasSearched(true);
      setSearching(false);
    }, 300);
    return () => {
      clearTimeout(t);
      setSearching(false);
    };
  }, [query, searchUrl, excludeProfileId, value]);

  if (value) {
    return (
      <div className="p-3 rounded bg-neutral-800/80 border border-neutral-700">
        <p className="text-sm font-medium text-primary mb-2">{label}</p>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white text-sm">{profileDisplayName(value)}</p>
            {value.email && (
              <p className="text-gray-400 text-xs mt-0.5">{value.email}</p>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-gray-400 hover:text-white shrink-0"
            >
              Change
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded bg-neutral-800/80 border border-neutral-700">
      <p className="text-sm font-medium text-primary mb-2">{label}</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white text-sm disabled:opacity-50"
      />
      {searching && (
        <p className="text-xs text-gray-500 mt-2">Searching…</p>
      )}
      {results.length > 0 && (
        <div className="mt-2 divide-y divide-neutral-800 rounded-md border border-neutral-700 bg-neutral-900">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p);
                setQuery("");
                setResults([]);
                setHasSearched(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-neutral-800"
            >
              <span className="text-white">{profileDisplayName(p)}</span>
              {p.email && (
                <span className="text-xs text-gray-400">{p.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {hasSearched && !searching && query.trim().length >= 2 && results.length === 0 && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">
          <p>No matching CCS account found. Ask your partner to create one at Country City Swing.</p>
          <p className="mt-2 text-xs text-amber-200/80">
            Share this link:{" "}
            <Link href="/auth" className="underline hover:text-white">
              countrycityswing.dance/auth
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
