export default function EventsListSkeleton() {
  const rows = 4;
  return (
    <div
      className="max-w-3xl mx-auto text-left bg-neutral-800 rounded-lg shadow-[0_0_20px_rgba(187,134,252,0.2)] divide-y divide-neutral-700"
      aria-hidden
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-5 animate-pulse">
          <div className="h-6 bg-neutral-700 rounded w-3/4 mb-3" />
          <div className="h-4 bg-neutral-700 rounded w-1/2 mb-2" />
          <div className="h-4 bg-neutral-700 rounded w-1/3 mb-3" />
          <div className="flex gap-3 mt-4">
            <div className="h-9 bg-neutral-700 rounded w-24" />
            <div className="h-9 bg-neutral-700 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
