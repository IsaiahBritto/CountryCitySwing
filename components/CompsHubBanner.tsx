import Link from "next/link";

/** Slim entry point to the public comps hub (events section). */
export default function CompsHubBanner({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/comps"
      className={
        "mx-auto my-6 flex max-w-xl items-center justify-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-center transition hover:border-primary hover:bg-primary/15 " +
        className
      }
    >
      <span className="text-xl leading-none text-primary" aria-hidden>
        ★
      </span>
      <span className="text-sm font-semibold text-primary sm:text-base">
        CCS Competitions — live results, signups &amp; past winners
      </span>
    </Link>
  );
}
