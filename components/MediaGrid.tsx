"use client";

import { useEffect, useState } from "react";
import { fetchDriveMedia } from "../lib/drive";

interface MediaItem {
  id: string;
  name: string;
  type: string;
  url: string;
  thumb?: string;
}

export default function MediaGrid() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMedia = async () => {
      try {
        const res = await fetchDriveMedia();
        setMedia(res);
      } catch (e) {
        console.error("Failed to load media", e);
      } finally {
        setLoading(false);
      }
    };
    loadMedia();
  }, []);

  if (loading) return <p className="text-center text-gray-400">Loading media...</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {media.map((item) => (
        <div
          key={item.id}
          className="rounded overflow-hidden border border-neutral-700 bg-neutral-900"
        >
          {item.type === "video" ? (
            <video src={item.url} controls className="w-full h-64 object-cover" />
          ) : (
            <img
              src={item.thumb || item.url}
              alt={item.name}
              className="w-full h-64 object-cover"
            />
          )}
          <div className="p-2 text-center text-gray-300 text-sm truncate">{item.name}</div>
        </div>
      ))}
    </div>
  );
}
