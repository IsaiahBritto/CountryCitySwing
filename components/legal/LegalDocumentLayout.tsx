import Link from "next/link";
import type { ReactNode } from "react";
import {
  LEGAL_DRAFT_NOTICE,
  LEGAL_LAST_UPDATED,
  LEGAL_MAILING_ADDRESS,
  LEGAL_SITE_NAME,
} from "@/lib/legal/constants";

type Section = { id: string; title: string };

export default function LegalDocumentLayout({
  title,
  sections,
  children,
}: {
  title: string;
  sections: Section[];
  children: ReactNode;
}) {
  return (
    <article className="max-w-4xl mx-auto text-neutral-100 pb-8">
      <header className="text-center mb-10">
        <h1 className="gold-wave text-3xl sm:text-4xl font-extrabold mb-2 pb-2 tracking-wide">
          {title}
        </h1>
        <p className="text-sm text-gray-500">
          {LEGAL_SITE_NAME} · Last updated {LEGAL_LAST_UPDATED}
        </p>
        <div className="mt-4 flex justify-center">
          <div className="w-full max-w-md h-[1px] bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full" />
        </div>
      </header>

      <div
        role="note"
        className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 leading-relaxed"
      >
        <p className="font-semibold text-amber-200 mb-1">Draft for legal review</p>
        <p>{LEGAL_DRAFT_NOTICE}</p>
        {!LEGAL_MAILING_ADDRESS && (
          <p className="mt-2 text-amber-200/90">
            <strong>Action for counsel:</strong> A formal postal mailing address (for example a PO Box
            or registered agent address) should be added before finalizing marketing email footers and
            these policies. Until then, contact us at{" "}
            <a href="mailto:contact.us@countrycityswing.dance" className="underline">
              contact.us@countrycityswing.dance
            </a>
            .
          </p>
        )}
      </div>

      <nav
        aria-label="On this page"
        className="mb-10 rounded-xl border border-neutral-700 bg-neutral-800/50 px-4 py-4"
      >
        <p className="text-sm font-semibold text-primary mb-2">On this page</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-gray-300 hover:text-primary underline-offset-2 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="prose-legal space-y-10 text-gray-300 text-base leading-relaxed">
        {children}
      </div>

      <footer className="mt-12 pt-8 border-t border-neutral-800 text-sm text-gray-500 text-center space-y-2">
        <p>
          Related:{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          {" · "}
          <Link href="/cookies" className="text-primary hover:underline">
            Cookie Policy
          </Link>
        </p>
        <p>
          Questions?{" "}
          <a href="mailto:contact.us@countrycityswing.dance" className="text-primary hover:underline">
            contact.us@countrycityswing.dance
          </a>
        </p>
      </footer>
    </article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-bold text-primary mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
