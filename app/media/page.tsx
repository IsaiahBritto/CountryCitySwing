"use client";

import WeeklyPhotoCarousel from "@/components/WeeklyPhotoCarousel";
import InstagramEmbed from "@/components/InstagramEmbed";

export default function MediaPage() {
  return (
    <section className="max-w-5xl mx-auto text-center">
      <div className="mb-16">
        <h3 className="text-xl font-semibold text-primary mb-4">
          Weekly Class Photos
        </h3>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl mx-auto">
          Click through our weekly class photos. Newest first. Use the arrows or swipe on mobile.
        </p>
        <WeeklyPhotoCarousel />
      </div>

      <div className="pt-8 border-t border-neutral-700">
        <InstagramEmbed />
      </div>
    </section>
  );
}
