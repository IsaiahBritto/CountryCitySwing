export default function MerchGridSkeleton() {
  const cards = 6;
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      aria-hidden
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="bg-neutral-800 rounded-lg overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-neutral-700" />
          <div className="p-4 space-y-2">
            <div className="h-6 bg-neutral-700 rounded w-2/3" />
            <div className="h-5 bg-neutral-700 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
