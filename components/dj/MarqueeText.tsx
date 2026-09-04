"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type MarqueeTextProps = {
  children: ReactNode;
  className?: string;
};

export default function MarqueeText({ children, className = "" }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [durationSec, setDurationSec] = useState(18);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const mobile = window.matchMedia("(max-width: 639px)").matches;
    setIsMobile(mobile);

    if (!mobile) {
      setOverflows(false);
      return;
    }

    const overflow = content.scrollWidth > container.clientWidth + 1;
    setOverflows(overflow);
    if (overflow) {
      const pxPerSec = 28;
      setDurationSec(
        Math.max(12, Math.min(24, content.scrollWidth / pxPerSec))
      );
    }
  }, []);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    measure();

    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(container);

    const mq = window.matchMedia("(max-width: 639px)");
    const onMq = () => measure();
    mq.addEventListener("change", onMq);

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, [measure, children]);

  const showMarquee = isMobile && overflows && !reduceMotion;

  return (
    <div
      ref={containerRef}
      className={`min-w-0 ${showMarquee ? "overflow-hidden" : "truncate sm:truncate"} ${className}`}
    >
      {showMarquee ? (
        <div
          className="marquee-track inline-flex whitespace-nowrap"
          style={{ animationDuration: `${durationSec}s` }}
        >
          <span ref={contentRef} className="inline-block pr-8">
            {children}
          </span>
          <span className="inline-block pr-8" aria-hidden="true">
            {children}
          </span>
        </div>
      ) : (
        <span ref={contentRef} className="block truncate">
          {children}
        </span>
      )}
    </div>
  );
}
