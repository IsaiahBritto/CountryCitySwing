"use client";

import { formatShownOn, type InstructorFieldDef } from "@/lib/instructorProfileFields";

const inputClass =
  "w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-white";

export default function ProfileField({
  field,
  value,
  onChange,
  id,
}: {
  field: InstructorFieldDef;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const fieldId = id ?? `profile-field-${field.key}`;

  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-medium text-gray-200">
        {field.label}
      </label>
      {field.inputType === "textarea" ? (
        <textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          className={inputClass + " resize-none"}
        />
      ) : field.inputType === "date" ? (
        <input
          id={fieldId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      ) : (
        <input
          id={fieldId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
      <p className="text-xs text-gray-400">{field.help}</p>
      <p className="text-xs text-gray-500">
        Shown on: {formatShownOn(field.shownOn)}
      </p>
    </div>
  );
}
