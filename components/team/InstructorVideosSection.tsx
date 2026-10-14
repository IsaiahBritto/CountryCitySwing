import InstructorWeekBlock from "@/components/team/InstructorWeekBlock";
import type { InstructorWeek } from "@/lib/team/teamMemberResources";

type Props = {
  subtitle: string;
  weeks: InstructorWeek[];
};

export default function InstructorVideosSection({ subtitle, weeks }: Props) {
  return (
    <section id="instructor-videos" aria-label="Instructor Videos">
      <h2 className="gold-wave text-3xl font-extrabold text-center mb-3 pb-1">
        Instructor Videos
      </h2>
      <p className="text-gray-300 text-center mb-12">{subtitle}</p>

      <div className="space-y-12">
        {weeks.map((week) => (
          <InstructorWeekBlock key={week.id} week={week} />
        ))}
      </div>
    </section>
  );
}
