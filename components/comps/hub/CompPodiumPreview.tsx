import { ordinalLabel } from "@/lib/comps/hubTypes";
import type { PodiumEntry } from "@/lib/comps/podium";

export default function CompPodiumPreview({
  podium,
}: {
  podium: PodiumEntry[] | null;
}) {
  if (podium && podium.length > 0) {
    return (
      <ol className="mt-3 space-y-1 border-t border-neutral-700/80 pt-3">
        {podium.map((p) => (
          <li
            key={`${p.placement}-${p.displayName}`}
            className="flex items-baseline gap-2 text-sm"
          >
            <span className="w-8 shrink-0 font-semibold text-primary">
              {ordinalLabel(p.placement)}
            </span>
            <span className="w-10 shrink-0 font-mono text-neutral-500">
              {p.bibNumber ?? "—"}
            </span>
            <span className="text-neutral-200">{p.displayName}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p className="mt-2 text-xs text-neutral-500">Results in progress</p>
  );
}
