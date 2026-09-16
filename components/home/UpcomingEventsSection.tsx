"use client";

import type { ReactNode } from "react";
import { CcsButton } from "@/components/ccs";

type Props = {
  isAdmin: boolean;
  onAddEvent: () => void;
  view: "dynamic" | "list";
  onViewChange: (view: "dynamic" | "list") => void;
  loading: boolean;
  loadingFallback?: ReactNode;
  hasUpcoming: boolean;
  dynamicView: ReactNode;
  listView: ReactNode;
  adminTools?: ReactNode;
  modals: ReactNode;
};

export default function UpcomingEventsSection({
  isAdmin,
  onAddEvent,
  view,
  onViewChange,
  loading,
  loadingFallback,
  hasUpcoming,
  dynamicView,
  listView,
  adminTools,
  modals,
}: Props) {
  return (
    <section className="max-w-5xl mx-auto text-center px-4 pt-10 pb-16 min-h-screen">
      <div
        id="upcoming-events"
        className="relative mb-4 flex flex-col items-center gap-3 md:block md:gap-0 scroll-mt-6"
      >
        <h2 className="gold-wave ccs-text-gold-wave text-4xl font-extrabold pb-2 text-center">
          This Month / Upcoming Events
        </h2>
        <p className="text-gray-400 text-sm mb-2 md:mb-0">
          <CcsButton href="/events" variant="ghostGold" className="min-h-0 py-1 px-3 text-xs">
            View full events calendar
          </CcsButton>
        </p>
        {isAdmin && (
          <div className="md:absolute md:right-0 md:top-0 shrink-0">
            <button
              type="button"
              onClick={onAddEvent}
              className="btn-signup text-sm px-4 py-2 rounded-md"
            >
              Add Event
            </button>
          </div>
        )}
      </div>

      <div className="ccs-segmented mb-8">
        <button
          type="button"
          onClick={() => onViewChange("dynamic")}
          className={`ccs-segmented__item ${
            view === "dynamic" ? "ccs-segmented__item--active-gold" : "ccs-segmented__item--inactive"
          }`}
        >
          Dynamic View
        </button>
        <button
          type="button"
          onClick={() => onViewChange("list")}
          className={`ccs-segmented__item ${
            view === "list" ? "ccs-segmented__item--active-purple" : "ccs-segmented__item--inactive"
          }`}
        >
          List View
        </button>
      </div>

      {loading && (loadingFallback ?? <p className="text-gray-400 mb-8">Loading events…</p>)}
      {!loading && !hasUpcoming && (
        <p className="text-gray-400 mb-8">No upcoming events yet.</p>
      )}

      {!loading && hasUpcoming && view === "dynamic" && dynamicView}
      {!loading && hasUpcoming && view === "list" && listView}

      {adminTools}

      {modals}
    </section>
  );
}
