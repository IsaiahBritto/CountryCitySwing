import {
  THE_SOCIAL_SECTION_TITLE,
  theSocialPlaylistLinks,
  withBioExternalUtm,
} from "@/lib/bioLinks";

export default function BioTheSocialSection() {
  return (
    <section className="mt-14 bg-transparent border-0 shadow-none p-0">
      <h2 className="link-tree-section-title silver-wave text-lg sm:text-xl font-extrabold uppercase tracking-widest text-center pb-0">
        {THE_SOCIAL_SECTION_TITLE}
      </h2>
      <div
        className="link-tree-section-divider mx-auto mt-3 mb-4 w-24 h-px"
        aria-hidden
      />
      <div
        role="navigation"
        aria-label="The Social playlist links"
        className="space-y-5 bg-transparent border-0 shadow-none p-0 m-0"
      >
        {theSocialPlaylistLinks.map((link) => (
          <a
            key={link.id}
            href={withBioExternalUtm(link.href, link.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-tree-link link-tree-link-silver link-tree-tile-silver-wrap block rounded-2xl bg-gradient-to-r from-neutral-500 via-[#d4d4d4] to-neutral-500 p-[1px]"
          >
            <span className="flex items-center justify-center w-full min-h-[52px] rounded-[15px] px-4 text-base font-semibold bg-[#0a0a0c]/80 backdrop-blur-sm text-neutral-200">
              {link.label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
