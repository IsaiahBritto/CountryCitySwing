import Image from "next/image";
import { BIO_TAGLINE } from "@/lib/bioLinks";

export type BioTheme = "classic" | "poster";

interface BioHeaderProps {
  theme: BioTheme;
}

export default function BioHeader({ theme }: BioHeaderProps) {
  const isPoster = theme === "poster";

  return (
    <header
      className={
        isPoster
          ? "text-center mb-7 bg-transparent border-0 shadow-none"
          : "text-center mb-7"
      }
    >
      {isPoster ? (
        <div className="mx-auto mb-5 flex h-[150px] w-[150px] items-center justify-center">
          <Image
            src="/media/logo-dark.PNG"
            alt="Country City Swing Logo"
            width={150}
            height={150}
            className="block h-[150px] w-[150px] drop-shadow-[0_0_6px_rgba(242,201,76,0.55),0_0_14px_rgba(242,201,76,0.4),0_0_24px_rgba(187,134,252,0.65)]"
            priority
          />
        </div>
      ) : (
        <Image
          src="/media/logo-dark.jpg"
          alt="Country City Swing Logo"
          width={150}
          height={150}
          className="mx-auto mb-4 drop-shadow-[0_0_12px_rgba(242,201,76,0.45)]"
          priority
        />
      )}
      <h1
        className={
          isPoster
            ? "link-tree-title gold-wave text-2xl sm:text-3xl font-extrabold uppercase tracking-widest pb-1"
            : "gold-wave text-3xl font-extrabold pb-1"
        }
      >
        Country City Swing
      </h1>
      <p
        className={
          isPoster
            ? "text-[#BB86FC] text-sm mt-3 max-w-xs mx-auto"
            : "text-neutral-300 text-sm mt-2 max-w-xs mx-auto"
        }
      >
        {BIO_TAGLINE}
      </p>
      {isPoster && (
        <div
          className="link-tree-divider mt-6 mx-auto w-32 h-px"
          aria-hidden
        />
      )}
    </header>
  );
}
