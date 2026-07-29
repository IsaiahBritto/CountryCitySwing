"use client";

export type ChoiceCardOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type ChoiceCardsProps = {
  name: string;
  value: string | undefined | null;
  onChange: (value: string) => void;
  options: ChoiceCardOption[];
  className?: string;
  hasError?: boolean;
  "aria-label"?: string;
};

export default function ChoiceCards({
  name,
  value,
  onChange,
  options,
  className = "",
  hasError = false,
  "aria-label": ariaLabel,
}: ChoiceCardsProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel || name}
      aria-invalid={hasError || undefined}
      className={`space-y-2 rounded-lg ${
        hasError ? "ring-2 ring-red-500 p-1" : ""
      } ${className}`.trim()}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const disabled = Boolean(option.disabled);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            name={name}
            onClick={() => {
              if (!disabled) onChange(option.value);
            }}
            className={`w-full text-left rounded-lg border px-4 py-3.5 transition-colors ${
              disabled
                ? "opacity-60 cursor-not-allowed border-neutral-700 bg-neutral-800/40"
                : selected
                  ? "border-primary bg-primary/10 ring-1 ring-primary cursor-pointer"
                  : "border-neutral-700 bg-neutral-800/60 hover:border-neutral-500 cursor-pointer"
            }`}
          >
            <span className="block text-base font-medium text-white">
              {option.label}
            </span>
            {option.description ? (
              <span className="mt-1 block text-sm text-gray-300 leading-snug">
                {option.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
