import { supabaseServer } from "@/lib/supabaseServer";

const PRAYER_CONTACT_NAMES = [
  ["isaiah", "britto"],
  ["hannah", "bonaguide"],
  ["nicole", "maxon"],
  ["michael", "reichenberger"],
  ["seth", "vink"],
] as const;

export default async function PrayerTeamGrid() {
  const { data: profiles } = await supabaseServer
    .from("profiles")
    .select("first_name, last_name, photo_url")
    .order("first_name", { ascending: true });

  const normalize = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const members = PRAYER_CONTACT_NAMES.map(([first, last]) =>
    profiles?.find(
      (p) => normalize(p.first_name) === first && normalize(p.last_name) === last
    )
  ).filter(Boolean) as { first_name: string; last_name: string; photo_url: string | null }[];

  if (members.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 max-w-4xl mx-auto mt-10">
      {members.map((m) => (
        <div key={`${m.first_name}-${m.last_name}`} className="ccs-card p-4 text-center">
          <div className="w-24 h-24 mx-auto mb-3 relative">
            {m.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.photo_url}
                alt={`${m.first_name} ${m.last_name}`}
                className="rounded-full object-cover w-full h-full border-2 border-primary"
              />
            ) : (
              <div className="w-full h-full rounded-full border-2 border-primary flex items-center justify-center text-xs text-gray-400">
                No Photo
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-neutral-100">
            {m.first_name} {m.last_name}
          </p>
        </div>
      ))}
    </div>
  );
}
