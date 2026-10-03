"use client";

import { useRouter } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/solid";
import InstructorProfileView, {
  type InstructorProfileViewData,
} from "@/components/InstructorProfileView";

export type { InstructorProfileViewData as InstructorProfile };

export default function InstructorProfileClient({
  profile,
  fromDirectory,
}: {
  profile: InstructorProfileViewData;
  fromDirectory?: boolean;
}) {
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={() => router.back()}
    >
      <section
        className="w-full max-w-3xl mx-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <button
            className="absolute top-4 right-4 text-neutral-400 hover:text-primary transition-colors z-10"
            onClick={() => router.back()}
            aria-label="Close profile"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          <InstructorProfileView profile={profile} fromDirectory={fromDirectory} />
        </div>
      </section>
    </div>
  );
}
