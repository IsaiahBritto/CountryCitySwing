"use client";

export type NonCcsEventsTab = "upcoming" | "past";

const shellClass =
  "flex w-full max-w-md rounded-lg border border-yellow-400/50 bg-neutral-900/80 p-1 shadow-[0_0_16px_rgba(242,201,76,0.15)]";
const activeClass =
  "flex-1 rounded-md border border-yellow-400/70 bg-yellow-400/20 px-4 py-2 text-center text-sm font-semibold leading-tight text-yellow-400 shadow-[0_0_12px_rgba(242,201,76,0.35)]";
const inactiveClass =
  "flex-1 rounded-md border border-transparent px-4 py-2 text-center text-sm font-medium leading-tight text-neutral-400 transition hover:text-yellow-400/90";

export default function NonCcsEventsTabToggle({
  active,
  onChange,
}: {
  active: NonCcsEventsTab;
  onChange: (tab: NonCcsEventsTab) => void;
}) {
  const options: { id: NonCcsEventsTab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Past" },
  ];

  return (
    <div className={shellClass}>
      {options.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!isActive) onChange(id);
            }}
            className={isActive ? activeClass : inactiveClass}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}