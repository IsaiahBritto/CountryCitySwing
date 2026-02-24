"use client";

import WeeklyPhotoCarousel from "@/components/WeeklyPhotoCarousel";
import NcsnPhotosByDate from "@/components/NcsnPhotosByDate";
import InstagramEmbed from "@/components/InstagramEmbed";

export default function MediaPage() {
  return (
    <section className="max-w-5xl mx-auto text-center">
      <div className="mb-16">
        <h3 className="gold-wave text-4xl font-extrabold mb-4 pb-2">
          Weekly Class Photos
        </h3>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl mx-auto">
          Click through our weekly class photos. Newest first. Use the arrows or swipe on mobile.
        </p>
        <WeeklyPhotoCarousel />
      </div>

      <div className="mb-16 pt-12 border-t border-neutral-700">
        <h3 className="gold-wave text-3xl font-extrabold mb-4 pb-2">
          Photos by Date
        </h3>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl mx-auto">
          Browse NCSN photo folders. Click a folder to open its photos. Use the arrows to see more.
        </p>
        <NcsnPhotosByDate />
      </div>

      <div className="pt-8 border-t border-neutral-700">
        <InstagramEmbed />
      </div>
    </section>
  );
}
