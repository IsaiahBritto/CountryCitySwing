"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <section className="text-center max-w-xl mx-auto py-16 px-4">
      <h1 className="gold-wave text-4xl font-extrabold mb-4 pb-2">
        Something went wrong
      </h1>
      <p className="text-lg text-gray-300 mb-8">
        We ran into an unexpected error. You can try again or head back home.
      </p>
      <div className="flex justify-center flex-wrap gap-4">
        <button
          type="button"
          onClick={reset}
          className="btn btn-primary px-6 py-3 rounded-md font-semibold"
        >
          Try again
        </button>
        <a
          href="/"
          className="btn btn-primary inline-block px-6 py-3 rounded-md font-semibold"
        >
          Back to Home
        </a>
      </div>
    </section>
  );
}
