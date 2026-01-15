"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface InstructorProfile {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  role: string;
  bio: string | null;
  bio_long: string | null;
  instagram_url: string | null;
  teaching_since: string | null;
  favorite_song: string | null;
  teaching_style: string | null;
  specialty: string | null;
  phone_number: string | null;
  private_lessons: string | null;
}

export default function InstructorProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState<InstructorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabaseBrowser
        .from("profiles")
        .select(
          `id, first_name, last_name, photo_url, role, bio, bio_long, instagram_url,
           teaching_since, favorite_song, teaching_style, specialty, phone_number, private_lessons`
        )
        .eq("id", id)
        .single();

      if (!error) setProfile(data);
      setLoading(false);
    }
    loadProfile();
  }, [id]);

  if (loading)
    return <p className="text-center text-gray-400 mt-10">Loading profile...</p>;
  if (!profile)
    return (
      <p className="text-center text-gray-400 mt-10">Instructor not found.</p>
    );

  // helper to assign display title
  const normalize = (s: string) => s.trim().toLowerCase();
  const getInstructorTitle = (first: string, last: string) => {
    const f = normalize(first);
    const l = normalize(last);
    if (f === "isaiah" && l === "britto") return "Owner & Head Instructor";
    if (f === "malissa" && l === "petersen") return "Head Instructor";
    return "Assistant Instructor";
  };

  const displayTitle = getInstructorTitle(profile.first_name, profile.last_name);

  const show = (val?: string | null) =>
    val !== null && val !== undefined && val.trim() !== "";

  return (
    <section className="max-w-3xl mx-auto text-center px-6 py-12 text-white">
      <div className="bg-neutral-800 rounded-lg p-8 shadow-[0_0_25px_rgba(242,201,76,0.25)] text-left sm:text-center space-y-6 break-words">
        {/* Photo */}
        {profile.photo_url && (
          <img
            src={profile.photo_url}
            alt={`${profile.first_name} ${profile.last_name}`}
            className="w-40 h-40 rounded-full mx-auto mb-4 object-cover"
          />
        )}

        {/* Name + Role */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-primary mb-1 break-words">
            {profile.first_name} {profile.last_name}
          </h2>
          <p className="text-gray-400 italic mb-6 break-words">{displayTitle}</p>
        </div>

        {/* Long Bio */}
        {show(profile.bio_long) && (
          <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-line break-words">
            {profile.bio_long}
          </p>
        )}

        {/* Specialty */}
        {show(profile.specialty) && (
          <p className="text-yellow-400 font-semibold break-words">
            Specialty: {profile.specialty}
          </p>
        )}

        {/* Teaching Info */}
        {(show(profile.teaching_style) || show(profile.teaching_since)) && (
          <div className="space-y-2 break-words">
            {show(profile.teaching_style) && (
              <p className="text-gray-300">
                <span className="text-primary font-medium">
                  Teaching Style:
                </span>{" "}
                {profile.teaching_style}
              </p>
            )}
            {show(profile.teaching_since) && (
                <p className="text-gray-300">
                    <span className="text-primary font-medium">
                    Teaching Since:
                    </span>{" "}
                    {profile.teaching_since
                    ? new Date(profile.teaching_since).getFullYear()
                    : ""}
                </p>
                )}
          </div>
        )}

        {/* Favorite Song */}
        {show(profile.favorite_song) && (
          <p className="text-gray-300 break-words">
            <span className="text-primary font-medium">Favorite Song:</span>{" "}
            {profile.favorite_song}
          </p>
        )}

        {/* Private Lessons */}
        {show(profile.private_lessons) && (
          <div className="break-words">
            <p className="text-primary font-medium mb-1">Private Lessons:</p>
            <p className="text-gray-300 whitespace-pre-line">
              {profile.private_lessons}
            </p>
          </div>
        )}

        {/* Contact & Social */}
        {(show(profile.instagram_url) || show(profile.phone_number)) && (
          <div className="mt-8 border-t border-neutral-700 pt-6 space-y-3 text-center">
            {show(profile.instagram_url) && (
              <p>
                <a
                  href={profile.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white underline decoration-1 underline-offset-2 hover:shadow-[0_0_8px_rgba(242,201,76,0.8)] transition-all duration-300 break-all"
                >
                  Instagram
                </a>
              </p>
            )}
            {show(profile.phone_number) && (
              <p className="text-gray-300 break-words">
                <span className="text-primary font-medium">Phone:</span>{" "}
                {profile.phone_number}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
