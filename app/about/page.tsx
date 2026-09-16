import { supabaseServer } from "@/lib/supabaseServer";
import InstructorCard from "@/components/team/InstructorCard";
import { CcsButton, CcsHeading } from "@/components/ccs";

export const dynamic = "force-dynamic";

interface Instructor {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role: string;
  bio_long: string | null;
  specialty: string | null;
}

export default async function AboutPage() {
  const { data: profiles, error } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, photo_url, role, bio_long, specialty")
    .order("first_name", { ascending: true });

  const ccsProfiles =
    profiles?.filter((p) => (p.role ?? "").toLowerCase() !== "non-ccs-instructor") ?? [];

  const normalize = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const isaiah = ccsProfiles.find(
    (p) => normalize(p.first_name) === "isaiah" && normalize(p.last_name) === "britto"
  );
  const hannah = ccsProfiles.find(
    (p) => normalize(p.first_name) === "hannah" && normalize(p.last_name) === "bonaguide"
  );

  const isInstructorRole = (role: string | null | undefined): boolean => {
    if (!role) return false;
    const roleLower = role.toLowerCase();
    if (roleLower === "non-ccs-instructor") return false;
    if (roleLower === "admin") return true;
    return roleLower === "instructor" || roleLower.includes("instructor");
  };

  const assistants = ccsProfiles.filter(
    (p) =>
      !(normalize(p.first_name) === "isaiah" && normalize(p.last_name) === "britto") &&
      !(normalize(p.first_name) === "hannah" && normalize(p.last_name) === "bonaguide") &&
      isInstructorRole(p.role)
  );

  return (
    <section className="max-w-5xl mx-auto py-12 text-neutral-100 px-4">
      <header className="text-center mb-12">
        <CcsHeading level={1} variant="goldWave" className="mb-6">
          Our Story
        </CcsHeading>
        <div className="ccs-divider-gold max-w-md mx-auto mb-8" />
      </header>

      <div className="space-y-6 text-lg leading-relaxed text-gray-300 max-w-3xl mx-auto text-center">
        <p>
          Founded in the heart of Nashville, Tennessee,{" "}
          <span className="text-primary font-semibold">Country City Swing</span> blends the energy
          of modern country music with the timeless joy of partner dancing.
        </p>
        <p>
          Our mission is to create a{" "}
          <span className="text-primary font-medium">welcoming, faith-driven community</span> where
          dancers of all levels — from curious beginners to experienced performers — can learn, grow,
          and connect through movement, music, and joy.
        </p>
        <p>
          We believe dancing is more than just steps — it&apos;s a celebration of fellowship,
          gratitude, and expression. Every event, class, and workshop we host is designed to help
          people experience the connection between dance, relationship, and faith.
        </p>
        <p>
          From the very beginning, our goal was clear —{" "}
          <span className="text-primary font-medium">the eyes should never be on us</span>, but
          always on Him. That conviction guided every step of our journey, including the creation of
          the <strong className="text-primary">Country City Swing logo</strong>.
        </p>
        <p>
          The logo&apos;s design is intentional —{" "}
          <span className="text-primary font-medium">keeping Christ first</span> as a reminder of
          the One who makes it all possible.
        </p>
      </div>

      <p className="ccs-quote-accent text-center mt-10 max-w-xl mx-auto">
        &ldquo;Dance for joy, dance for connection, dance for His glory.&rdquo;
      </p>

      <section id="team" className="scroll-mt-24 mt-20 pt-12 border-t border-neutral-800">
        <CcsHeading level={2} variant="goldWave" className="text-center mb-10">
          Meet The Team
        </CcsHeading>

        {error && (
          <p className="text-center text-gray-400">Error loading team...</p>
        )}

        {!error && (
          <>
            <div className="flex flex-wrap justify-center gap-10 mb-14">
              {isaiah && (
                <InstructorCard member={isaiah} title="Owner & Head Instructor" />
              )}
              {hannah && <InstructorCard member={hannah} title="Head Instructor" />}
            </div>

            {assistants.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10 justify-items-center">
                {assistants.map((member) => (
                  <InstructorCard
                    key={member.id}
                    member={member}
                    title="Assistant Instructor"
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-14 flex justify-center">
          <CcsButton href="/instructors" variant="solidGold" className="w-full max-w-md">
            Find An Instructor
          </CcsButton>
        </div>
      </section>
    </section>
  );
}
