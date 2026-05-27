import { getBioSocialLinks } from "@/lib/bioLinks";
import type { BioTheme } from "./BioHeader";

interface BioSocialRowProps {
  theme: BioTheme;
}

export default function BioSocialRow({ theme }: BioSocialRowProps) {
  const socialLinks = getBioSocialLinks();
  const isPoster = theme === "poster";

  if (socialLinks.length === 0) return null;

  return (
    <section
      className={
        isPoster
          ? "mt-7 bg-transparent border-0 shadow-none p-0"
          : "mt-7"
      }
    >
      <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2 text-center">
        Follow us
      </p>
      <div
        className={
          isPoster ? "flex flex-col gap-3" : "grid grid-cols-2 gap-3"
        }
      >
        {socialLinks.map((item) =>
          isPoster ? (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="link-tree-link link-tree-social link-tree-tile-accent-wrap block rounded-xl bg-gradient-to-r from-[#F2C94C]/60 via-[#BB86FC]/60 to-[#F2C94C]/60 p-[1px]"
            >
              <span className="flex flex-col items-center justify-center min-h-[48px] rounded-[11px] bg-[#0a0a0c]/80 backdrop-blur-sm py-2 text-neutral-200 hover:text-primary transition-colors">
                <span className="font-semibold text-sm">{item.label}</span>
                <span className="text-xs text-neutral-500">{item.handle}</span>
              </span>
            </a>
          ) : (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center min-h-[48px] py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200 hover:text-primary hover:border-primary transition-colors"
            >
              <span className="font-semibold text-sm">{item.label}</span>
              <span className="text-xs text-neutral-500">{item.handle}</span>
            </a>
          )
        )}
      </div>
    </section>
  );
}
