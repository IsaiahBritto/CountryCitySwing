"use client";

import { useState } from "react";

export default function HowCompsWork() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-neutral-400 underline-offset-2 hover:text-primary hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide" : "How comps work"}
      </button>
      {open && (
        <div className="mt-3 space-y-2 rounded-xl border border-neutral-700 bg-neutral-800/40 p-4 text-sm text-neutral-300">
          <p>
            <span className="font-semibold text-white">Jack &amp; Jill</span> —
            you enter as a Lead or Follow. Early rounds use callbacks (Yes / Alt /
            No); advancing dancers are paired for finals and placed with relative
            placement scoring.
          </p>
          <p>
            <span className="font-semibold text-white">Strictly</span> — you enter
            with a partner. Couples dance through the rounds together and are
            placed in finals.
          </p>
          <p>
            Results appear here as each round is published. On comp night, the
            Live Now section shows what is happening on the floor and who is
            advancing.
          </p>
        </div>
      )}
    </div>
  );
}
