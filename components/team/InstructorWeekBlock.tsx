import type { InstructorWeek } from "@/lib/team/teamMemberResources";
import InstructorVideoEmbed from "@/components/team/InstructorVideoEmbed";

type Props = {
  week: InstructorWeek;
};

function PoiColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-primary font-semibold mb-2">{heading}</h4>
      <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function InstructorWeekBlock({ week }: Props) {
  const copyBlock = (
    <div className="flex flex-col justify-center">
      <p className="team-week-label text-2xl sm:text-3xl font-bold mb-3 tracking-wide text-accent">
        {week.label}
      </p>
      <h3 className="text-primary font-semibold text-lg mb-3">{week.bigPictureTitle}</h3>
      <ul className="list-disc list-inside space-y-1 text-gray-300">
        {week.moves.map((move) => (
          <li key={move}>{move}</li>
        ))}
      </ul>
    </div>
  );

  const videoBlock = (
    <InstructorVideoEmbed videoUrl={week.videoUrl} title={`${week.label} recap`} />
  );

  return (
    <article className="space-y-8 pb-12 border-b border-neutral-800 last:border-b-0 last:pb-0">
      <div className="grid gap-6 md:grid-cols-2 md:gap-8 md:items-center">
        {week.videoOnRight ? (
          <>
            <div className="order-2 md:order-1">{copyBlock}</div>
            <div className="order-1 md:order-2">{videoBlock}</div>
          </>
        ) : (
          <>
            <div>{videoBlock}</div>
            <div>{copyBlock}</div>
          </>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-3 text-left">
        <PoiColumn heading="LEADERS (POI)" items={week.poi.leaders} />
        <PoiColumn heading="FOLLOWERS (POI)" items={week.poi.followers} />
        <PoiColumn heading="BOTH (POI)" items={week.poi.both} />
      </div>
    </article>
  );
}
