"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import InstagramEmbed from "@/components/InstagramEmbed";
import TestEventsSection from "./TestEventsSection";
import TestNcsnPlaceholder from "./TestNcsnPlaceholder";
import TestSocialPlaceholder from "./TestSocialPlaceholder";
import TestDnaSection from "./TestDnaSection";

const ACCENTS = {
  events: { hex: "#F2C94C", rgb: [242, 201, 76] as const },
  ncsn: { hex: "#4169E1", rgb: [65, 105, 225] as const },
  "the-social": { hex: "#d4d4d4", rgb: [212, 212, 212] as const },
  dna: { hex: "#2BC929", rgb: [43, 201, 41] as const },
} as const;

type SectionKey = keyof typeof ACCENTS;

const SECTION_ORDER: SectionKey[] = ["events", "ncsn", "the-social", "dna"];

const BLEND_ZONE = 0.28;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpRgb(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
) {
  return [
    Math.round(lerp(from[0], to[0], t)),
    Math.round(lerp(from[1], to[1], t)),
    Math.round(lerp(from[2], to[2], t)),
  ] as const;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function EventPageTestClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("events");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const doc = document.documentElement;
    doc.classList.add("event-page-accent-active");

    const applyAccent = (rgb: readonly [number, number, number]) => {
      const accent = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
      const accentRgb = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      root.style.setProperty("--ep-accent", accent);
      root.style.setProperty("--ep-accent-rgb", accentRgb);
      doc.style.setProperty("--ep-accent", accent);
      doc.style.setProperty("--ep-accent-rgb", accentRgb);
    };

    applyAccent(ACCENTS.events.rgb);

    const updateAccent = () => {
      const sections = SECTION_ORDER.map((key) => {
        const el = document.getElementById(key === "the-social" ? "the-social" : key);
        return { key, el };
      }).filter((s): s is { key: SectionKey; el: HTMLElement } => Boolean(s.el));

      if (sections.length === 0) return;

      const viewportAnchor = window.innerHeight * 0.35;
      let currentIndex = 0;

      for (let i = 0; i < sections.length; i++) {
        const top = sections[i].el.getBoundingClientRect().top;
        if (top <= viewportAnchor) currentIndex = i;
      }

      const current = sections[currentIndex];
      const next = sections[currentIndex + 1];
      let rgb: readonly [number, number, number] = ACCENTS[current.key].rgb;
      let active: SectionKey = current.key;

      if (next) {
        const currentRect = current.el.getBoundingClientRect();
        const nextTopDoc = window.scrollY + next.el.getBoundingClientRect().top;
        const currentTopDoc = window.scrollY + currentRect.top;
        const span = Math.max(nextTopDoc - currentTopDoc, 1);
        const progress =
          (window.scrollY + viewportAnchor - currentTopDoc) / span;
        const blendStart = 1 - BLEND_ZONE;

        if (progress >= blendStart) {
          const t = easeInOut(
            Math.min(1, Math.max(0, (progress - blendStart) / BLEND_ZONE))
          );
          rgb = lerpRgb(ACCENTS[current.key].rgb, ACCENTS[next.key].rgb, t);
          if (t > 0.55) active = next.key;
        }
      }

      applyAccent(rgb);
      setActiveSection(active);
    };

    updateAccent();
    window.addEventListener("scroll", updateAccent, { passive: true });
    window.addEventListener("resize", updateAccent);
    return () => {
      window.removeEventListener("scroll", updateAccent);
      window.removeEventListener("resize", updateAccent);
      doc.classList.remove("event-page-accent-active");
      doc.style.removeProperty("--ep-accent");
      doc.style.removeProperty("--ep-accent-rgb");
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      ref={rootRef}
      className="event-page-test relative text-neutral-100"
      style={
        {
          "--ep-accent": ACCENTS.events.hex,
          "--ep-accent-rgb": ACCENTS.events.rgb.join(", "),
        } as CSSProperties
      }
    >
      <div className="event-page-test-glow" aria-hidden />

      <div
        className="event-page-brand-grid mx-auto max-w-4xl px-6 pt-12 pb-10 sm:pt-16 sm:pb-12"
        role="navigation"
        aria-label="Brand sections"
      >
        <button
          type="button"
          onClick={() => scrollToSection("dna")}
          className={`event-page-brand-link event-page-brand-link-dna ${
            activeSection === "dna" ? "is-active" : ""
          }`}
          aria-label="Jump to DNA"
        >
          <Image
            src="/media/dna-logo.png"
            alt="DNA"
            width={200}
            height={80}
            className="h-14 sm:h-16 w-auto object-contain"
            priority
          />
        </button>

        <button
          type="button"
          onClick={() => scrollToSection("ncsn")}
          className={`event-page-brand-link event-page-brand-link-ncsn max-w-[11rem] ${
            activeSection === "ncsn" ? "is-active" : ""
          }`}
        >
          <span
            className="font-bold uppercase leading-snug tracking-wide text-sm sm:text-base"
            style={{ color: ACCENTS.ncsn.hex }}
          >
            Nashville Country Swing Nights
          </span>
        </button>

        <button
          type="button"
          onClick={() => scrollToSection("the-social")}
          className={`event-page-brand-link event-page-brand-link-social ${
            activeSection === "the-social" ? "is-active" : ""
          }`}
        >
          <span className="silver-wave text-xl sm:text-2xl font-extrabold uppercase tracking-widest">
            The Social.
          </span>
        </button>
      </div>

      <TestEventsSection />
      <TestNcsnPlaceholder />
      <TestSocialPlaceholder />
      <TestDnaSection />

      <section className="relative max-w-5xl mx-auto text-center px-4 pt-12 pb-20 border-t border-yellow-500/20">
        <InstagramEmbed />
      </section>
    </div>
  );
}
