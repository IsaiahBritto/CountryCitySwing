import { Suspense } from "react";
import DjDeckPageClient from "./DjDeckPageClient";

export default function DjDeckPage() {
  return (
    <Suspense
      fallback={
        <section className="max-w-[1600px] mx-auto px-4 py-8">
          <p className="text-neutral-400">Loading DJ deck…</p>
        </section>
      }
    >
      <DjDeckPageClient />
    </Suspense>
  );
}
