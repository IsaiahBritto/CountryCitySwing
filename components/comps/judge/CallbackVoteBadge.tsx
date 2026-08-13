import type { CallbackVote } from "@/lib/scoring/callbackRawSync";

export default function CallbackVoteBadge({
  vote,
}: {
  vote: CallbackVote | undefined;
}) {
  if (!vote) {
    return (
      <span className="shrink-0 rounded-md border border-neutral-600 px-2 py-0.5 text-xs font-semibold text-neutral-400">
        —
      </span>
    );
  }

  const label =
    vote === "yes"
      ? "Yes"
      : vote.startsWith("alt")
        ? vote.replace("alt", "A").toUpperCase()
        : vote === "no"
          ? "No"
          : vote;

  const className =
    vote === "yes"
      ? "shrink-0 rounded-md bg-green-600 px-2 py-0.5 text-xs font-semibold text-white"
      : vote.startsWith("alt")
        ? "shrink-0 rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-neutral-900"
        : vote === "no"
          ? "shrink-0 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
          : "shrink-0 rounded-md border border-neutral-600 px-2 py-0.5 text-xs font-semibold text-neutral-400";

  return <span className={className}>{label}</span>;
}
