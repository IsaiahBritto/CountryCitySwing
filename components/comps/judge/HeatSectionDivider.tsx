export default function HeatSectionDivider({
  heatNumber,
  entryCount,
}: {
  heatNumber: number;
  entryCount?: number;
}) {
  return (
    <div className="mb-3 mt-1 flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="shrink-0 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Heat {heatNumber}
        </span>
        {entryCount != null && (
          <span className="ml-2 text-xs text-neutral-500">({entryCount})</span>
        )}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    </div>
  );
}
