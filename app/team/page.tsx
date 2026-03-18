import { supabaseServer } from "@/lib/supabaseServer";
import Link from "next/link";
import { nameToSlug } from "@/lib/utils/slugHelpers";

interface Instructor {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role: string;
  bio_long: string | null;
  specialty: string | null;
}

export default async function TeamPage() {
  // Fetch profiles server-side using supabaseServer to bypass RLS
  const { data: profiles, error } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, photo_url, role, bio_long, specialty")
    .order("first_name", { ascending: true });

  if (error) {
    console.error("Error loading profiles:", error.message);
    return <p className="text-center text-gray-400 mt-10">Error loading team...</p>;
  }

  if (!profiles || profiles.length === 0) {
    return (
      <p className="text-center text-gray-400 mt-10">No instructors found.</p>
    );
  }

  // CCS Team only: exclude non-CCS directory instructors (they appear on /instructors)
  const ccsProfiles = profiles.filter(
    (p) => (p.role ?? "").toLowerCase() !== "non-ccs-instructor"
  );

  const normalize = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  // Find Isaiah & Malissa
  const isaiah = ccsProfiles.find(
    (p) =>
      normalize(p.first_name) === "isaiah" &&
      normalize(p.last_name) === "britto"
  );
  const malissa = ccsProfiles.find(
    (p) =>
      normalize(p.first_name) === "malissa" &&
      normalize(p.last_name) === "petersen"
  );

  // Helper function to check if a role indicates a CCS instructor (admin or instructor, not non-ccs-instructor)
  const isInstructorRole = (role: string | null | undefined): boolean => {
    if (!role) return false;
    const roleLower = role.toLowerCase();
    if (roleLower === "non-ccs-instructor") return false;
    if (roleLower === "admin") return true;
    return roleLower === "instructor" || roleLower.includes("instructor");
  };

  // Everyone else = assistant instructors (CCS only)
  const assistants = ccsProfiles.filter(
    (p) =>
      !(
        normalize(p.first_name) === "isaiah" &&
        normalize(p.last_name) === "britto"
      ) &&
      !(
        normalize(p.first_name) === "malissa" &&
        normalize(p.last_name) === "petersen"
      ) &&
      isInstructorRole(p.role)
  );

  return (
    <section className="max-w-5xl mx-auto text-center px-4 py-12">
      <h2 className="gold-wave text-4xl font-extrabold mb-10 pb-2">
        Meet Our Instructors
      </h2>

      {/* Top row: Isaiah & Malissa */}
      <div className="flex flex-wrap justify-center gap-10 mb-14">
        {isaiah && (
          <InstructorCard member={isaiah} title="Owner & Head Instructor" />
        )}
        {malissa && (
          <InstructorCard member={malissa} title="Head Instructor" />
        )}
      </div>

      {/* Assistant instructors */}
      {assistants.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10 justify-items-center">
          {assistants.map((member) => (
            <InstructorCard
              key={member.id}
              member={member}
              title="Assistant Instructor"
            />
          ))}
        </div>
      )}

      <p className="mt-14 text-center text-neutral-400">
        <Link href="/instructors" className="text-primary hover:text-yellow-400 underline">
          Find more instructors by state →
        </Link>
      </p>
    </section>
  );
}

/* ---------- Card Component ---------- */
function InstructorCard({
  member,
  title,
}: {
  member: Instructor;
  title: string;
}) {
  return (
    <div className="text-center bg-neutral-800 rounded-lg p-6 shadow-[0_0_20px_rgba(242,201,76,0.25)] hover:shadow-[0_0_25px_rgba(242,201,76,0.5)] transition-all duration-300 w-56 h-[22rem] flex flex-col items-center justify-start">
      <div className="relative w-36 h-36 mb-4">
        {member.photo_url ? (
          <img
            src={member.photo_url}
            alt={`${member.first_name} ${member.last_name}`}
            className="rounded-full object-cover w-full h-full border-2 border-yellow-400"
          />
        ) : (
          <div className="w-full h-full rounded-full border-2 border-yellow-400 flex items-center justify-center text-yellow-300 text-sm">
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
          <p className="text-yellow-400 text-xs mt-1">{member.specialty}</p>
        )}
      </div>

      <Link
        href={`/team/${nameToSlug(member.first_name, member.last_name)}`}
        className="btn-signup text-sm px-4 py-2 rounded-md"
      >
        See Profile
      </Link>
    </div>
  );
}
