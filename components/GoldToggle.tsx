"use client";

type GoldToggleProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  id?: string;
};

export default function GoldToggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  id,
}: GoldToggleProps) {
  const readOnly = disabled || !onChange;
  const inputId = id ?? `gold-toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={readOnly ? undefined : inputId}
          className={`block font-medium text-gray-300 ${readOnly ? "" : "cursor-pointer"}`}
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </div>
      <button
        id={readOnly ? undefined : inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={readOnly}
        onClick={() => {
          if (!readOnly && onChange) onChange(!checked);
        }}
        className={`relative inline-flex h-8 w-14 flex-shrink-0 items-center rounded-full border transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
          readOnly ? "cursor-default opacity-90" : "cursor-pointer"
        } ${
          checked
            ? "border-yellow-400/60 bg-yellow-400/20"
            : "border-neutral-600 bg-neutral-800"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full shadow-md transition-all duration-300 ease-in-out ${
            checked
              ? "translate-x-7 bg-yellow-400"
              : "translate-x-1 bg-neutral-500"
          }`}
          aria-hidden
        />
      </button>
    </div>
  );
}
