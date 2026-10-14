import CcsHeading from "@/components/ccs/CcsHeading";
import InstructorWeekBlock from "@/components/team/InstructorWeekBlock";
import type { InstructorWeek } from "@/lib/team/teamMemberResources";

type Props = {
  subtitle: string;
  weeks: InstructorWeek[];
};

export default function InstructorVideosSection({ subtitle, weeks }: Props) {
  return (
    <section id="instructor-videos" aria-label="Instructor Videos">
      <CcsHeading level={2} variant="goldWave" className="text-center mb-3">
        Instructor Videos
      </CcsHeading>
      <p className="text-gray-300 text-center mb-12">{subtitle}</p>

      <div className="space-y-12">
        {weeks.map((week) => (
          <InstructorWeekBlock key={week.id} week={week} />
        ))}
      </div>
    </section>
  );
}
