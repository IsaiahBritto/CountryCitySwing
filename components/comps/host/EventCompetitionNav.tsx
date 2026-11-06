"use client";

import Link from "next/link";

export type EventCompetitionNavItem = {
  id: string;
  name: string;
  comp_type?: string | null;
};

const TYPE_SHORT: Record<string, string> = {
  jack_and_jill: "JnJ",
  strictly: "Strictly",
  all_american: "All Am.",
};

export default function EventCompetitionNav({
  eventId,
  competitions,
  currentCompetitionId,
  hubHref,
  showBibs = true,
  activeSection,
}: {
  eventId: string;
  competitions: EventCompetitionNavItem[];
  /** @deprecated use activeSection */
  currentCompetitionId?: string | null;
  hubHref: string;
  showBibs?: boolean;
  activeSection?: "hub" | "bibs" | string;
}) {
  const resolvedActive =
    activeSection ??
    (currentCompetitionId ? currentCompetitionId : undefined);

  const linkCls = (active: boolean) =>
    active
      ? "shrink-0 rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
      : "shrink-0 rounded-md border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 hover:border-primary/50";

  return (
    <nav
      className="mb-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Event competitions"
    >
      <Link href={hubHref} className={linkCls(resolvedActive === "hub")}>
        Event hub
      </Link>
      {showBibs && (
        <Link
          href={`/admin/comps/events/${eventId}/bibs`}
          className={linkCls(resolvedActive === "bibs")}
        >
          Bibs
        </Link>
      )}
      {competitions.map((c) => {
        const typeLabel =
          (c.comp_type && TYPE_SHORT[c.comp_type]) || c.comp_type || "";
        const active = resolvedActive === c.id;
        return (
          <Link
            key={c.id}
            href={`/admin/comps/${c.id}`}
            className={linkCls(active)}
            title={typeLabel ? `${c.name} (${typeLabel})` : c.name}
          >
            {c.name}
            {typeLabel ? (
              <span className="ml-1 text-xs text-neutral-400">({typeLabel})</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
