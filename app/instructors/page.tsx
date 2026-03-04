import { supabaseServer } from "@/lib/supabaseServer";
import { getUsStatesGeography, getUsCountiesGeography } from "@/lib/usMapGeography";
import InstructorsContent from "@/components/InstructorsContent";
import type { InstructorForMap } from "@/components/InstructorMap";

// Always fetch fresh instructor data so new/updated profiles and geocoding show up
export const dynamic = "force-dynamic";

function isCoreInstructor(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "instructor" || r.includes("instructor");
}

function isNonCCSInstructor(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "non-ccs-instructor";
}

/** Non-CCS-Instructor counts as "filled" if they have name and at least photo or bio. */
function isFilledProfile(p: {
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  bio_long: string | null;
}): boolean {
  const hasName =
    (p.first_name ?? "").trim() !== "" && (p.last_name ?? "").trim() !== "";
  const hasContent = (p.photo_url ?? "").trim() !== "" || (p.bio_long ?? "").trim() !== "";
  return !!hasName && !!hasContent;
}

export default async function InstructorsPage() {
  const [profilesResult, geography, countiesGeography] = await Promise.all([
    supabaseServer.from("profiles").select("*").order("first_name", { ascending: true }),
    getUsStatesGeography(),
    getUsCountiesGeography(),
  ]);
  const { data: profiles, error } = profilesResult;
  // Location columns (state, zip_code, latitude, longitude) come from migration; undefined until run.

  if (error) {
    console.error("Instructors page error:", error.message);
    return (
      <p className="text-center text-gray-400 mt-10">Error loading instructors.</p>
    );
  }

  type Row = (typeof profiles)[number] & {
    state?: string | null;
    zip_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };

  const list = (profiles ?? []).filter((p) => {
    if (isCoreInstructor(p.role)) return true;
    if (isNonCCSInstructor(p.role) && isFilledProfile(p)) return true;
    return false;
  }) as Row[];

  const statesWithInstructors = [
    ...new Set(
      list.map((p) => (p.state ?? "").trim()).filter(Boolean)
    ),
  ].sort();

  // Group by state; instructors with no state go in "Other" so everyone in list is shown
  const OTHER_LABEL = "Other";
  const byState: { state: string; instructors: Row[] }[] = [
    ...statesWithInstructors.map((state) => ({
      state,
      instructors: list.filter((p) => (p.state ?? "").trim() === state),
    })),
    ...(list.some((p) => !(p.state ?? "").trim())
      ? [{ state: OTHER_LABEL, instructors: list.filter((p) => !(p.state ?? "").trim()) }]
      : []),
  ];

  const instructorsForMap: InstructorForMap[] = list.map((p) => {
    const stateTrimmed = (p.state ?? "").trim() || null;
    const row = p as Record<string, unknown>;
    const latRaw = p.latitude ?? row["latitude"];
    const lonRaw = p.longitude ?? row["longitude"];
    const latitude =
      typeof latRaw === "number" && !Number.isNaN(latRaw)
        ? latRaw
        : typeof latRaw === "string"
          ? (() => {
              const n = parseFloat(latRaw);
              return Number.isNaN(n) ? null : n;
            })()
          : null;
    const longitude =
      typeof lonRaw === "number" && !Number.isNaN(lonRaw)
        ? lonRaw
        : typeof lonRaw === "string"
          ? (() => {
              const n = parseFloat(lonRaw);
              return Number.isNaN(n) ? null : n;
            })()
          : null;
    return {
      id: p.id,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      photo_url: p.photo_url ?? null,
      state: stateTrimmed,
      latitude,
      longitude,
      specialty: p.specialty ?? null,
    };
  });

  return (
    <section className="max-w-5xl mx-auto px-4 py-12">
      <h2 className="gold-wave text-4xl font-extrabold mb-4 pb-2 text-center">
        Find Instructors
      </h2>
      <p className="text-center text-neutral-400 mb-10 max-w-xl mx-auto">
        CCS team and directory instructors by state. Click a state on the map to zoom and see locations.
      </p>

      <InstructorsContent
        byState={byState.map(({ state, instructors }) => ({
          state,
          instructors: instructors.map((p) => ({
            id: p.id,
            first_name: p.first_name ?? null,
            last_name: p.last_name ?? null,
            photo_url: p.photo_url ?? null,
            specialty: p.specialty ?? null,
            role: p.role ?? null,
          })),
        }))}
        instructorsForMap={instructorsForMap}
        statesWithInstructors={statesWithInstructors}
        initialGeography={geography ?? undefined}
        initialCountiesGeography={countiesGeography ?? undefined}
      />
    </section>
  );
}
