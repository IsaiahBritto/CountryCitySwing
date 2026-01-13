"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface Instructor {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role: string;
}

export default function TeamPage() {
  const [profiles, setProfiles] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfiles() {
      // ✅ Get all profiles (no filter)
      const { data, error } = await supabaseBrowser
        .from("profiles")
        .select("id, first_name, last_name, photo_url, role")
        .order("first_name", { ascending: true });

      if (error) {
        console.error("Error loading profiles:", error.message);
      } else {
        setProfiles(data || []);
      }
      setLoading(false);
    }

    loadProfiles();
  }, []);

  if (loading)
    return <p className="text-center text-gray-400 mt-10">Loading team...</p>;

  if (profiles.length === 0)
    return (
      <p className="text-center text-gray-400 mt-10">No team members found.</p>
    );

  // --- Normalize helper ---
  const normalize = (s: string) => s.trim().toLowerCase();

  // --- Find Isaiah + Malissa regardless of role ---
  const isaiah = profiles.find(
    (p) =>
      normalize(p.first_name) === "isaiah" &&
      normalize(p.last_name) === "britto"
  );
  const malissa = profiles.find(
    (p) =>
      normalize(p.first_name) === "malissa" &&
      normalize(p.last_name) === "petersen"
  );

  // --- Everyone else (assistant instructors only) ---
  const assistants = profiles.filter((p) => {
    const role = normalize(p.role);
    const isInstructor = role.includes("instructor");
    const isIsaiah =
      normalize(p.first_name) === "isaiah" &&
      normalize(p.last_name) === "britto";
    const isMalissa =
      normalize(p.first_name) === "malissa" &&
      normalize(p.last_name) === "petersen";
    return isInstructor && !isIsaiah && !isMalissa;
  });

  return (
    <section className="max-w-5xl mx-auto text-center px-4 py-12">
      <h2 className="text-3xl font-semibold text-primary mb-10">
        Meet Our Instructors
      </h2>

      {/* --- Top row: Isaiah & Malissa --- */}
      <div className="flex flex-wrap justify-center gap-10 mb-14">
        {isaiah && (
          <InstructorCard
            member={isaiah}
            title="Owner & Head Instructor"
          />
        )}
        {malissa && (
          <InstructorCard
            member={malissa}
            title="Head Instructor"
          />
        )}
      </div>

      {/* --- Assistant instructors --- */}
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
    <div className="text-center bg-neutral-800 rounded-lg p-6 shadow-[0_0_20px_rgba(242,201,76,0.25)] hover:shadow-[0_0_25px_rgba(242,201,76,0.5)] transition-all duration-300 w-56 h-[20rem] flex flex-col items-center justify-start">
      <div className="relative w-36 h-36 mb-4">
        {member.photo_url ? (
          <img
            src={member.photo_url}
            alt={`${member.first_name} ${member.last_name}`}
            className="rounded-full object-cover w-full h-full "
          />
        ) : (
          <div className="w-full h-full rounded-full border-2 border-yellow-400 flex items-center justify-center text-yellow-300 text-sm">
            No Photo
          </div>
        )}
      </div>

      <div className="flex flex-col items-center flex-grow">
        <h3 className="text-lg font-bold text-primary">
          {member.first_name} {member.last_name}
        </h3>
        <p className="text-gray-400 mt-1 text-center text-sm">{title}</p>
      </div>
    </div>
  );
}
