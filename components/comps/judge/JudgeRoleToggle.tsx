"use client";

import { compBtnTabActiveSm } from "@/lib/comps/buttonStyles";
import type { DanceRole } from "@/lib/comps/types";

export default function JudgeRoleToggle({
  activeRole,
  onRoleChange,
}: {
  activeRole: DanceRole;
  onRoleChange: (role: DanceRole) => void;
}) {
  return (
    <div className="flex w-full rounded-md border border-neutral-700 p-px">
      {(
        [
          { role: "lead" as const, label: "Leads" },
          { role: "follow" as const, label: "Follows" },
        ] as const
      ).map(({ role, label }) => {
        const active = activeRole === role;
        return (
          <button
            key={role}
            type="button"
            onClick={() => {
              if (!active) onRoleChange(role);
            }}
            className={
              "flex-1 rounded-[5px] px-2.5 py-0.5 text-center text-xs leading-tight transition " +
              (active
                ? compBtnTabActiveSm
                : "border border-transparent font-medium text-neutral-400 hover:text-white")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
