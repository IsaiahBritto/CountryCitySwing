"use client";

export type MerchAdminSection = "merch" | "gift_cards";

type MerchAdminSectionToggleProps = {
  value: MerchAdminSection;
  onChange: (section: MerchAdminSection) => void;
};

export default function MerchAdminSectionToggle({
  value,
  onChange,
}: MerchAdminSectionToggleProps) {
  const sections: { id: MerchAdminSection; label: string }[] = [
    { id: "merch", label: "Merch" },
    { id: "gift_cards", label: "Gift cards" },
  ];

  return (
    <div className="flex justify-center mb-8">
      <div
        className="relative inline-flex rounded-lg border border-neutral-700 bg-neutral-800 p-1 shadow-[0_0_20px_rgba(242,201,76,0.08)]"
        role="tablist"
        aria-label="Admin section"
      >
        <div
          className={`absolute top-1 bottom-1 rounded-md bg-yellow-400 transition-all duration-300 ease-in-out ${
            value === "merch" ? "left-1" : "left-1/2"
          }`}
          style={{ width: "calc(50% - 0.25rem)" }}
          aria-hidden
        />
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={value === section.id}
            onClick={() => onChange(section.id)}
            className={`relative z-10 min-w-[8.5rem] px-6 py-2.5 rounded-md text-sm font-semibold transition-colors duration-300 sm:min-w-[9.5rem] sm:text-base ${
              value === section.id
                ? "text-neutral-900"
                : "text-gray-300 hover:text-yellow-400"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}