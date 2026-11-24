import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  createPrivatePlaylist,
} from "@/lib/spotify/client";
import { curateSocialFromMasters } from "@/lib/music/curateSocialFromMasters";
import {
  DEFAULT_SOCIAL_STRUCTURE,
  DEFAULT_DURATION_MINUTES,
  structureDescription,
  validateDurationMinutes,
  validatePlaylistStructure,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";

export type GeneratePlaylistResult = {
  id: string;
  url: string;
  durationMs: number;
  trackCount: number;
  lookedUp: number;
  stillUnknown: number;
  durationMinutes: number;
  structure: PlaylistStructure;
};

export type GeneratePlaylistOptions = {
  lookupFeatures?: boolean;
  durationMinutes?: number;
  structure?: PlaylistStructure;
};

export async function generatePlaylist(
  name: string,
  options?: GeneratePlaylistOptions
): Promise<GeneratePlaylistResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Playlist name is required");
  }
  if (trimmed.length > 100) {
    throw new Error("Playlist name must be 100 characters or fewer");
  }

  const lookupFeatures = options?.lookupFeatures === true;
  const durationMinutes = validateDurationMinutes(
    options?.durationMinutes ?? DEFAULT_DURATION_MINUTES
  );
  const structure = validatePlaylistStructure(
    options?.structure ?? DEFAULT_SOCIAL_STRUCTURE
  );

  const { accessToken } = await getValidAccessToken();
  const { curated, lookedUp, stillUnknown } = await curateSocialFromMasters({
    lookupFeatures,
    durationMinutes,
    structure,
    spotifyAccessToken: accessToken,
  });

  const description = `Country City Swing — ${structureDescription(structure)} / ${durationMinutes} min`;

  const created = await createPrivatePlaylist(
    accessToken,
    trimmed,
    description
  );

  await addTracksToPlaylist(
    accessToken,
    created.id,
    curated.tracks.map((t) => t.uri)
  );

  return {
    id: created.id,
    url: created.url,
    durationMs: curated.durationMs,
    trackCount: curated.tracks.length,
    lookedUp,
    stillUnknown,
    durationMinutes,
    structure,
  };
}

/** @deprecated use generatePlaylist */
export async function generateSocialPlaylist(
  name: string,
  options?: { lookupFeatures?: boolean }
): Promise<Omit<GeneratePlaylistResult, "durationMinutes" | "structure">> {
  const result = await generatePlaylist(name, options);
  const { durationMinutes: _d, structure: _s, ...rest } = result;
  return rest;
}
