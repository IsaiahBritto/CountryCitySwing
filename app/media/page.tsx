"use client";
import { useEffect, useState } from "react";

interface DriveFile {
  id: string;
  name: string;
  type: string;
  link: string;
  thumb: string;
}

export default function MediaPage() {
  const [media, setMedia] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch("/api/drive");
        const data = await res.json();
        setMedia(data.files || []);
      } catch (err) {
        console.error("Error loading media:", err);
      } finally {
        setLoading(false);
      }
    }

    loadMedia();
  }, []);

  if (loading)
    return (
      <div className="text-center text-gray-400 mt-10">Loading media...</div>
    );

  if (!media.length)
    return (
      <div className="text-center text-gray-400 mt-10">
        No media available yet.
      </div>
    );

  return (
    <section className="max-w-5xl mx-auto text-center">
      <h2 className="text-3xl font-semibold text-primary mb-6">Media Gallery</h2>
      <p className="text-gray-300 mb-8">
        View weekly photos and videos from our classes and events!
      </p>

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
        {media.map((file) => (
          <div
            key={file.id}
            className="bg-neutral-800 rounded-lg overflow-hidden shadow-lg hover:shadow-glow transition-all"
          >
            {file.type === "image" ? (
              <img
                src={file.link}
                alt={file.name}
                className="w-full h-64 object-cover"
              />
            ) : (
              <video
                controls
                className="w-full h-64 object-cover bg-black"
                src={file.link}
              />
            )}
            <p className="p-2 text-sm text-gray-300 truncate">{file.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
