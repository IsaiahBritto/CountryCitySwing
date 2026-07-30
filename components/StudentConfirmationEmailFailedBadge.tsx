"use client";

import { EnvelopeIcon } from "@heroicons/react/24/solid";

/** Red circle with mail icon and strike — student confirmation email was not sent. */
export default function StudentConfirmationEmailFailedBadge({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-white ${className}`}
      title="Confirmation email was not sent to the student"
      aria-label="Confirmation email was not sent to the student"
      role="img"
    >
      <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <span className="block h-0.5 w-4 rotate-[-45deg] rounded-full bg-white shadow-sm" />
      </span>
    </span>
  );
}
