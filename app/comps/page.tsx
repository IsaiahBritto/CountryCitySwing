"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PublicCompetition {
  id: string;
  name: string;
  comp_type: "jack_and_jill" | "strictly";
  event: { id: string; title: string; starts_at: string } | null;
  publishedRounds: number;
  latestPublishedAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

export default function PublicCompsPage() {
  const [competitions, setCompetitions] = useState<PublicCompetition[] | null>(
    null
  );

  useEffect(() => {
    fetch("/api/comps/results")
      .then((res) => (res.ok ? res.json() : { competitions: [] }))
      .then((data) => setCompetitions(data.competitions ?? []))
      .catch(() => setCompetitions([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-primary">Competition results</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Published results for Country City Swing competitions.
      </p>

      {competitions === null ? (
        <p className="py-10 text-center text-neutral-500">Loading…</p>
      ) : competitions.length === 0 ? (
        <p className="py-10 text-center text-neutral-500">
          No published results yet — check back after the next comp!
        </p>
      ) : (
        <div className="space-y-3">
          {competitions.map((c) => (
            <Link
              key={c.id}
              href={`/comps/${c.id}`}
              className="block rounded-xl border border-neutral-700 bg-neutral-800/50 p-4 transition hover:border-primary/60"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{c.name}</div>
                  <div className="text-sm text-neutral-400">
                    {TYPE_LABEL[c.comp_type]} · {c.event?.title}
                    {c.event?.starts_at &&
                      ` · ${new Date(c.event.starts_at).toLocaleDateString()}`}
                  </div>
                </div>
                <span className="text-sm text-neutral-500">
                  {c.publishedRounds} round{c.publishedRounds === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
