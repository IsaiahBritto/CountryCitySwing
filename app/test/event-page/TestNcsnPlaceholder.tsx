"use client";

import WeeklyPhotoCarousel from "@/components/WeeklyPhotoCarousel";
import NcsnPhotosByDate from "@/components/NcsnPhotosByDate";

export default function TestNcsnPlaceholder() {
  return (
    <section
      id="ncsn"
      data-ep-section="ncsn"
      className="event-page-section relative min-h-[70vh] scroll-mt-6 px-4 py-16"
    >
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="royal-blue-wave text-3xl sm:text-4xl font-extrabold uppercase tracking-wide pb-2">
          Nashville Country Swing Nights
        </h2>
        <div
          className="mx-auto mt-3 mb-12 w-24 h-px bg-gradient-to-r from-transparent via-[#4169E1]/70 to-transparent"
          aria-hidden
        />

        <div className="mb-16">
          <h3 className="royal-blue-wave text-3xl sm:text-4xl font-extrabold mb-4 pb-2">
            Weekly Class Photos
          </h3>
          <p className="text-gray-400 text-sm mb-6 max-w-2xl mx-auto">
            Click through our weekly class photos. Newest first. Use the arrows or swipe on
            mobile.
          </p>
          <WeeklyPhotoCarousel />
        </div>

        <div className="pt-12 border-t border-[#4169E1]/25">
          <h3 className="royal-blue-wave text-2xl sm:text-3xl font-extrabold mb-4 pb-2">
            Photos by Date
          </h3>
          <p className="text-gray-400 text-sm mb-6 max-w-2xl mx-auto">
            Browse NCSN photo folders. Click a folder to open its photos. Use the arrows to see
            more.
          </p>
          <NcsnPhotosByDate />
        </div>
      </div>
    </section>
  );
}
