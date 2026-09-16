"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { CcsButton, CcsHeading } from "@/components/ccs";
import { brandAccents, type BrandAccentKey } from "@/lib/design/tokens";

const SECTION_ORDER: BrandAccentKey[] = ["default", "ncsn", "cityLights", "comps", "dna"];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function EventsPageClient() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = document.documentElement;
    doc.classList.add("event-page-accent-active");

    const applyRgb = (rgb: readonly [number, number, number]) => {
      const accentRgb = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      root.style.setProperty("--ep-accent-rgb", accentRgb);
      doc.style.setProperty("--ep-accent-rgb", accentRgb);
    };

    applyRgb(brandAccents.default.rgb);

    const onScroll = () => {
      const ids = ["hero", "ncsn", "city-lights", "comps", "dna"] as const;
      const anchor = window.innerHeight * 0.35;
      let active: BrandAccentKey = "default";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= anchor) {
          if (id === "hero") active = "default";
          else if (id === "ncsn") active = "ncsn";
          else if (id === "city-lights") active = "cityLights";
          else if (id === "comps") active = "comps";
          else if (id === "dna") active = "dna";
        }
      }
      applyRgb(brandAccents[active].rgb);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      doc.classList.remove("event-page-accent-active");
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="event-page-test relative text-neutral-100"
      style={
        {
          "--ep-accent-rgb": brandAccents.default.rgb.join(", "),
        } as CSSProperties
      }
    >
      <div className="event-page-test-glow" aria-hidden />

      <section id="hero" className="max-w-4xl mx-auto text-center px-4 pt-12 pb-16 scroll-mt-6">
        <CcsHeading level={1} variant="display" className="font-display mb-6">
          More Than a Dance Night
        </CcsHeading>
        <p className="ccs-body text-gray-300 max-w-2xl mx-auto mb-8">
          Country City Swing is Nashville&apos;s faith-driven partner dance community — weekly classes,
          socials, competitions, and friendships that last beyond the dance floor.
        </p>
        <CcsButton href="/#upcoming-events" variant="solidGold">
          View Full Events Calendar
        </CcsButton>
      </section>

      <section
        id="ncsn"
        data-brand="ncsn"
        className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center scroll-mt-6"
      >
        <div className="text-center md:text-left">
          <div className="inline-block rounded-lg bg-brand-ncsn/10 p-6 mb-6">
            <span className="royal-blue-wave text-2xl font-extrabold uppercase">NCSN</span>
          </div>
          <CcsButton href="/#upcoming-events" variant="ghostBrand">
            Sign Up
          </CcsButton>
        </div>
        <div>
          <p className="text-gray-300 leading-relaxed">
            Nashville Country Swing Nights is our weekly Tuesday gathering — group classes for every
            level followed by social dancing. Come learn, laugh, and grow with us on the floor.
          </p>
        </div>
      </section>

      <section
        id="city-lights"
        data-brand="city-lights"
        className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center scroll-mt-6"
      >
        <div className="order-2 md:order-1">
          <p className="text-gray-300 leading-relaxed mb-4">
            City Lights Social is a 6,000-square-foot ballroom experience with a structured song
            rotation so everyone gets time to dance.
          </p>
          <ul className="text-gray-400 text-sm space-y-1 list-disc list-inside mb-6">
            <li>2 West Coast Swing</li>
            <li>2 Country Swing</li>
            <li>2 Line Dance</li>
            <li>Steals circles</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <CcsButton href="/#upcoming-events" variant="solidPink">
              Sign Up
            </CcsButton>
            <CcsButton href="/social" variant="ghostBrand">
              Song Requests
            </CcsButton>
          </div>
        </div>
        <div className="order-1 md:order-2 text-center">
          <span className="silver-wave text-2xl font-extrabold uppercase tracking-widest block mb-2">
            City Lights Social
          </span>
          <p className="text-sm text-gray-400">First Saturday &amp; Third Friday of Every Month</p>
        </div>
      </section>

      <section
        id="comps"
        data-brand="comps"
        className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-start scroll-mt-6"
      >
        <div>
          <CcsHeading level={2} variant="display" className="font-display text-left mb-6">
            Tennessee State Competitions
          </CcsHeading>
          <div className="flex flex-wrap gap-3">
            <CcsButton href="/registration" variant="ghostGold">
              Registration
            </CcsButton>
            <CcsButton href="/comps" variant="ghostGold">
              Past Scores
            </CcsButton>
          </div>
        </div>
        <p className="text-gray-300 leading-relaxed md:text-right">
          Compete, grow, and qualify for State Finals. Whether it&apos;s your first Jack &amp; Jill or
          you&apos;re chasing a title, our comps are built to challenge and encourage you.
        </p>
      </section>

      <section
        id="dna"
        data-brand="dna"
        className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-start scroll-mt-6"
      >
        <div>
          <p className="text-gray-300 leading-relaxed mb-4">
            Dance Nash Aftermath (DNA) brings pro-level training, Tennessee State Competition, bar
            crawl, structured classes, and intimate group sizes — all with a mission to dance for His
            glory.
          </p>
          <ul className="text-gray-400 text-sm space-y-1 list-disc list-inside">
            <li>Tennessee State Competition</li>
            <li>Pro-level training tracks</li>
            <li>Structured training &amp; small classes</li>
          </ul>
        </div>
        <div className="text-center">
          <Image
            src="/media/dna-logo.png"
            alt="DNA"
            width={220}
            height={100}
            className="mx-auto h-20 w-auto object-contain mb-4"
          />
          <p className="text-sm text-gray-400 mb-6">Nashville TN — May 2027 · Dates TBD</p>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <CcsButton href="/dna" variant="ghostBrand">
              Tickets
            </CcsButton>
            <CcsButton href="/dna" variant="ghostBrand">
              Schedule
            </CcsButton>
            <CcsButton href="https://www.instagram.com/countrycityswing" variant="ghostBrand">
              Instagram
            </CcsButton>
            <CcsButton href="/dna" variant="ghostBrand">
              Venue
            </CcsButton>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto text-center px-4 pt-12 pb-20 border-t border-primary/20">
        <CcsHeading level={2} variant="display" className="font-display mb-6">
          Come Dance With Us
        </CcsHeading>
        <p className="text-gray-300 mb-4">All skill levels welcome.</p>
        <p className="text-primary font-semibold mb-8">Learn. Connect. Compete. Celebrate.</p>
        <p className="text-gray-400 text-sm leading-relaxed max-w-xl mx-auto">
          And through it all, our hope remains the same: Dance for joy, dance for connection, dance
          for His glory.
        </p>
        <div className="mt-10 flex justify-center gap-2 flex-wrap">
          {SECTION_ORDER.slice(1).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                scrollToId(
                  key === "cityLights" ? "city-lights" : key === "comps" ? "comps" : key
                )
              }
              className="text-xs uppercase tracking-wider text-gray-500 hover:text-primary"
            >
              {key}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
