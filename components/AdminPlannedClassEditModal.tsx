"use client";

import { useState } from "react";
import ChoiceCards from "@/components/ChoiceCards";
import {
  PLANNED_CLASS_LEVELS,
  PLANNED_CLASS_LEVEL_DESCRIPTIONS,
  PLANNED_CLASS_LEVEL_LABELS,
} from "@/lib/classLevels";
import {
  DANCE_ROLES,
  DANCE_ROLE_LABELS,
  type DanceRole,
} from "@/lib/upperLevelRegistration";
import type { PlannedClassLevel } from "@/lib/classLevels";

export default function AdminPlannedClassEditModal({
  open,
  onClose,
  signupId,
  signupName,
  currentLevel,
  currentRole,
  sessionToken,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  signupId: string;
  signupName: string;
  currentLevel: string | null | undefined;
  currentRole: string | null | undefined;
  sessionToken: string;
  onSaved: () => void;
}) {
  const [level, setLevel] = useState<PlannedClassLevel | "">(
    PLANNED_CLASS_LEVELS.includes(currentLevel as PlannedClassLevel)
      ? (currentLevel as PlannedClassLevel)
      : ""
  );
  const [role, setRole] = useState<DanceRole | "">(
    currentRole === "lead" || currentRole === "follow" ? currentRole : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSave = async () => {
    setError("");
    if (!level) {
      setError("Please select a class level.");
      return;
    }
    if (level === "upper_level" && !role) {
      setError("Please select Lead or Follow for Upper Level.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/signups", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          signupId,
          field: "planned_class_level",
          value: level,
          plannedDanceRole: level === "upper_level" ? role : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update registration.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Failed to update registration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-600 bg-neutral-900 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Change class level</h3>
            <p className="text-sm text-gray-400">{signupName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white shrink-0"
          >
            Close
          </button>
        </div>

        <p className="text-sm font-medium text-gray-200 mb-2">Planned class level</p>
        <ChoiceCards
          name="adminPlannedClassLevel"
          aria-label="Planned class level"
          value={level}
          onChange={(next) => {
            setLevel(next as PlannedClassLevel);
            if (next !== "upper_level") setRole("");
          }}
          options={PLANNED_CLASS_LEVELS.map((lvl) => ({
            value: lvl,
            label: PLANNED_CLASS_LEVEL_LABELS[lvl],
            description: PLANNED_CLASS_LEVEL_DESCRIPTIONS[lvl],
          }))}
        />

        {level === "upper_level" && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-200 mb-2">Lead or Follow</p>
            <ChoiceCards
              name="adminPlannedDanceRole"
              aria-label="Lead or Follow"
              value={role}
              onChange={(next) => setRole(next as DanceRole)}
              options={DANCE_ROLES.map((r) => ({
                value: r,
                label: DANCE_ROLE_LABELS[r],
              }))}
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-black hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
