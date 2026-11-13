"use client";

import { formatDivisionListLabel } from "@/lib/comps/divisionDisplay";

export type CompDivisionOption = {
  id: string;
  name: string;
  comp_type: string;
};

export default function CompDivisionRadioList({
  label,
  divisions,
  value,
  onChange,
  name,
}: {
  label: string;
  divisions: CompDivisionOption[];
  value: string;
  onChange: (id: string) => void;
  name: string;
}) {
  if (divisions.length === 0) return null;

  if (divisions.length === 1) {
    const only = divisions[0]!;
    return (
      <div className="rounded-md border border-neutral-600/80 bg-neutral-800/50 px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
        <p className="mt-1 text-sm text-neutral-100">
          {formatDivisionListLabel(only.name, only.comp_type)}
        </p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-gray-300">{label}</legend>
      {divisions.map((d) => (
        <label key={d.id} className="flex items-center gap-2 text-sm text-gray-200">
          <input
            type="radio"
            name={name}
            value={d.id}
            checked={value === d.id}
            onChange={() => onChange(d.id)}
            className="accent-primary"
            required
          />
          {formatDivisionListLabel(d.name, d.comp_type)}
        </label>
      ))}
    </fieldset>
  );
}
