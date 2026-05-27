import Link from "next/link";
import { bioLinks, withBioUtm, type BioLinkVariant } from "@/lib/bioLinks";
import type { BioTheme } from "./BioHeader";

interface BioLinkListProps {
  theme: BioTheme;
}

function classicClass(variant: BioLinkVariant): string {
  const base = "flex items-center justify-center w-full min-h-[52px] rounded-xl text-base";
  switch (variant) {
    case "primary":
      return `${base} btn btn-primary font-bold`;
    case "accent":
      return `${base} btn-signup font-semibold`;
    case "ghost":
      return `${base} border border-neutral-700 bg-neutral-800/70 text-neutral-200 hover:bg-neutral-700 transition-colors`;
  }
}

function posterInnerClass(variant: BioLinkVariant): string {
  const base =
    "flex items-center justify-center w-full min-h-[52px] rounded-[15px] px-4 text-base font-semibold bg-[#0a0a0c]/80 backdrop-blur-sm";
  switch (variant) {
    case "primary":
      return `${base} text-yellow-300`;
    case "accent":
      return `${base} text-neutral-100`;
    case "ghost":
      return `${base} text-neutral-300`;
  }
}

export default function BioLinkList({ theme }: BioLinkListProps) {
  const isPoster = theme === "poster";

  if (isPoster) {
    return (
      <div
        role="navigation"
        aria-label="Country City Swing links"
        className="space-y-5 bg-transparent border-0 shadow-none p-0 m-0"
      >
        {bioLinks.map((link) => {
          const href = withBioUtm(link.href, link.id);
          return (
            <Link
              key={link.id}
              href={href}
              className={`link-tree-link block rounded-2xl bg-gradient-to-r from-[#F2C94C] via-[#BB86FC] to-[#F2C94C] p-[1px] ${
                link.variant === "ghost" ? "link-tree-tile-ghost-wrap" : ""
              } ${link.variant === "primary" ? "link-tree-tile-primary-wrap" : ""} ${
                link.variant === "accent" ? "link-tree-tile-accent-wrap" : ""
              }`}
            >
              <span className={posterInnerClass(link.variant)}>{link.label}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="space-y-3" aria-label="Country City Swing links">
      {bioLinks.map((link) => {
        const href = withBioUtm(link.href, link.id);
        return (
          <Link key={link.id} href={href} className={classicClass(link.variant)}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
