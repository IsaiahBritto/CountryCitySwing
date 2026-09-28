"use client";

import {
  tnStateToggleActiveClass,
  tnStateToggleInactiveClass,
  tnStateToggleShellClass,
} from "@/lib/compLevels";
import { COMP_TYPE_LABEL } from "@/lib/comps/hubTypes";

export type HubCompType = "strictly" | "jack_and_jill";

const OPTIONS: { type: HubCompType; label: string }[] = [
  { type: "strictly", label: COMP_TYPE_LABEL.strictly },
  { type: "jack_and_jill", label: COMP_TYPE_LABEL.jack_and_jill },
];

export default function CompTypeToggle({
  activeType,
  onTypeChange,
}: {
  activeType: HubCompType;
  onTypeChange: (type: HubCompType) => void;
}) {
  return (
    <div className={tnStateToggleShellClass}>
      {OPTIONS.map(({ type, label }) => {
        const active = activeType === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => {
              if (!active) onTypeChange(type);
            }}
            className={active ? tnStateToggleActiveClass : tnStateToggleInactiveClass}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
