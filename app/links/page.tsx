import BioHeader from "@/components/bio/BioHeader";
import BioLinkList from "@/components/bio/BioLinkList";
import BioTheSocialSection from "@/components/bio/BioTheSocialSection";
import BioSocialRow from "@/components/bio/BioSocialRow";
import { BIO_FOOTER_LINE } from "@/lib/bioLinks";
import { getTheSocialPlaylistLinks } from "@/lib/theSocialPlaylistLinks";

export default async function LinksPage() {
  const links = await getTheSocialPlaylistLinks();

  return (
    <div className="link-tree min-h-[100dvh] text-neutral-100 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <main className="mx-auto w-full max-w-sm relative z-10 bg-transparent border-0 shadow-none p-0">
        <BioHeader theme="poster" />
        <BioLinkList theme="poster" />
        <BioTheSocialSection links={links} />
        <BioSocialRow theme="poster" />
        <div className="mt-8 text-center text-xs text-neutral-500 bg-transparent border-0 p-0">
          {BIO_FOOTER_LINE}
        </div>
      </main>
    </div>
  );
}
