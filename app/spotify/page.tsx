import { Suspense } from "react";
import SpotifyPageClient from "./SpotifyPageClient";

export default function SpotifyRoutePage() {
  return (
    <Suspense
      fallback={
        <section className="max-w-xl mx-auto text-center">
          <p className="text-gray-400">Loading…</p>
        </section>
      }
    >
      <SpotifyPageClient />
    </Suspense>
  );
}
