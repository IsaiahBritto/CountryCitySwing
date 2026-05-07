import Image from "next/image";

export const metadata = {
  title: "DNA — Dance Nashville Aftermath | Country City Swing",
  description:
    "Dance Nash Aftermath: pro-level country swing & west coast swing training, leveled competitions, and Nashville community. May 8–10, 2026.",
};

const DNA_EXTERNAL_URL = "https://wyldcountryevents.com/dna";
const DNA_TICKETS = "https://www.danceplace.com/index/no/16408/DNA-2026-Nashville_+TN-United+States-Country+Swing+Dance+event";
const DNA_SCHEDULE = "https://img1.wsimg.com/blobby/go/a769d4db-06c5-4be3-806a-8f9c1ddee1b0/DNA%202026%20SCHEDULE.pdf";
const DNA_VENUE = "https://www.dancenashville.com/"

export default function DNAPage() {
  return (
    <section className="max-w-4xl mx-auto px-6 pt-8 pb-16 text-neutral-100">
      {/* Logo */}
      <div className="flex justify-center mb-4">
        <Image
          src="/media/dna-logo.png"
          alt="DNA — Dance Nash Aftermath"
          width={640}
          height={400}
          className="w-full max-w-2xl h-auto object-contain"
          priority
        />
      </div>

      {/* Header */}
      <div className="text-center mb-10">
        <p className="text-xl font-semibold text-[#2BC929]">
          Nashville TN — May 8–10, 2026
        </p>
        <div className="mt-4 flex justify-center">
          <div className="w-100 h-[1px] bg-gradient-to-r from-transparent via-[#2BC929]/60 to-transparent rounded-full" />
        </div>
      </div>

      {/* Mission */}
      <div className="space-y-6 text-lg leading-relaxed text-gray-300">
        <h2 className="text-2xl font-bold mt-8 text-[#2BC929]">Our Mission</h2>
        <p>
          At <span className="font-semibold text-[#2BC929]">Dance Nash Aftermath</span>, we bring{" "}
          <span className="font-medium text-[#2BC929]">serious</span> country swing dancers face-to-face with{" "}
          <span className="font-medium text-[#2BC929]">pro-level training</span>, structured leveled competitions with clear criteria, and some insanely WYLD prizes.
        </p>

        <p>
          Together we will spend a weekend <strong>studying hard</strong> from some of the best in the world, <strong>leveling up as we do</strong>. We will <strong>push limits, cheer loud, and compete</strong> <em>together</em>—because champions (like communities) aren&apos;t just promised, they&apos;re built!
        </p>

        <p>
          We will <em>celebrate</em> the <strong>drive, creativity, and spirit</strong> of the Nashville Dance Community with a State Competition, Local Bar Crawl, and a focus on experiencing Nashville&apos;s incredible community.
        </p>

        <p>
          With more intimate class sizes you can learn <strong>country swing and line dance</strong> from national bar pros, and we have <strong>teaching, judging, and event leadership training</strong>, giving dancers the tools to grow in every part of the community!
        </p>

        <p>
          Whether you&apos;re here to <strong>compete, learn, or expand</strong>,{" "}
          <span className="font-semibold text-[#2BC929]">this is where community meets NASHVILLE!</span>
        </p>
      </div>

      {/* DNA Links */}
      <div className="mt-12 pt-10 border-t border-neutral-800">
        <h3 className="text-2xl font-extrabold mb-6 pb-2 text-center text-[#2BC929] drop-shadow-[0_0_8px_rgba(43,201,41,0.4)]">
          DNA Links
        </h3>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href={DNA_TICKETS}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-md font-semibold !text-[#2BC929] border border-[#2BC929]/60 hover:bg-[#2BC929]/10 transition-colors"
          >
            Tickets
          </a>
          <a
            href={DNA_SCHEDULE}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-md font-semibold !text-[#2BC929] border border-[#2BC929]/60 hover:bg-[#2BC929]/10 transition-colors"
          >
            Schedule
          </a>
          <a
            href="https://www.instagram.com/dna_dancenashaftermath"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-md font-semibold !text-[#2BC929] border border-[#2BC929]/60 hover:bg-[#2BC929]/10 transition-colors"
          >
            Instagram
          </a>
          <a
            href={DNA_VENUE}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-md font-semibold !text-[#2BC929] border border-[#2BC929]/60 hover:bg-[#2BC929]/10 transition-colors"
          >
            Venue
          </a>
        </div>
        <p className="text-center text-gray-400 text-sm mt-4">
          Event by{" "}
          <a
            href="https://wyldcountryevents.com"
            target="_blank"
            rel="noopener noreferrer"
            className="!text-[#2BC929] hover:underline hover:!text-[#2BC929]"
          >
            WYLD Country Events
          </a>
          <a>
            /Country City Swing
          </a>
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <div className="w-100 h-[1px] bg-gradient-to-r from-transparent via-[#2BC929] to-transparent rounded-full" />
      </div>
    </section>
  );
}
