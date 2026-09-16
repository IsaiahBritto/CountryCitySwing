import Link from "next/link";
import { nameToSlug } from "@/lib/utils/slugHelpers";

export type TeamMember = {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role?: string;
  specialty?: string | null;
};

export default function InstructorCard({
  member,
  title,
}: {
  member: TeamMember;
  title: string;
}) {
  return (
    <div className="text-center ccs-card p-6 shadow-[0_0_20px_rgba(242,201,76,0.25)] hover:shadow-[0_0_25px_rgba(242,201,76,0.5)] transition-all duration-300 w-full max-w-[14rem] sm:w-56 min-h-[22rem] flex flex-col items-center justify-start">
      <div className="relative w-36 h-36 mb-4">
        {member.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photo_url}
            alt={`${member.first_name} ${member.last_name}`}
            className="rounded-full object-cover w-full h-full border-2 border-primary"
          />
        ) : (
          <div className="w-full h-full rounded-full border-2 border-primary flex items-center justify-center text-primary text-sm">
            No Photo
          </div>
        )}
      </div>

      <div className="flex flex-col items-center flex-grow mb-4">
        <h3 className="text-lg font-bold text-primary">
          {member.first_name} {member.last_name}
        </h3>
        <p className="text-gray-400 mt-1 text-center text-sm">{title}</p>
        {member.specialty && (
          <p className="text-primary text-xs mt-1">{member.specialty}</p>
        )}
      </div>

      <Link
        href={`/team/${nameToSlug(member.first_name, member.last_name)}`}
        className="ccs-btn ccs-btn--ghost-gold text-sm px-4 py-2"
      >
        See Profile
      </Link>
    </div>
  );
}
