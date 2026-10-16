"use client";

import SpotifyPageClient from "@/app/spotify/SpotifyPageClient";
import { MusicPlatformToggle } from "@/components/music/MusicPlatformToggle";

export default function MusicAdminPageClient() {
  return (
    <>
      <MusicPlatformToggle />
      <SpotifyPageClient />
    </>
  );
}
