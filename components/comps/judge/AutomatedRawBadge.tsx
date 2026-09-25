"use client";

import { judgeAutomatedRawBadgeClass } from "@/lib/comps/judgeStyles";

export default function AutomatedRawBadge() {
  return (
    <span className={judgeAutomatedRawBadgeClass} title="Score set from Placements">
      Auto
    </span>
  );
}
