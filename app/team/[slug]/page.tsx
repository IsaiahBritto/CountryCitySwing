import { supabaseServer } from "@/lib/supabaseServer";
import { slugToName } from "@/lib/utils/slugHelpers";
import InstructorProfileClient from "./InstructorProfileClient";

function NotFound() {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
      <p className="text-center text-gray-400">Instructor not found.</p>
    </div>
  );
}

export default async function InstructorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const nameParts = slugToName(slug);
  if (!nameParts) {
    return <NotFound />;
  }

  // Fetch profiles server-side with service role so all users can see
  // (avoids RLS blocking unauthenticated or non-admin users)
  const { data: allProfiles, error } = await supabaseServer
    .from("profiles")
    .select(
      `id, first_name, last_name, photo_url, role, bio, bio_long, instagram_url,
       teaching_since, favorite_song, teaching_style, specialty, phone_number,
       private_lessons, private_lessons_link, scheduling_enabled, prayer`
    );

  if (error || !allProfiles) {
    return <NotFound />;
  }

  const normalize = (s: string) => s.trim().toLowerCase();
  const matchingProfile = allProfiles.find(
    (p) =>
      normalize(p.first_name) === normalize(nameParts.firstName) &&
      normalize(p.last_name) === normalize(nameParts.lastName)
  );

  if (!matchingProfile) {
    return <NotFound />;
  }

  return <InstructorProfileClient profile={matchingProfile} />;
}
