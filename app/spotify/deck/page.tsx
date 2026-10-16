import { redirect } from "next/navigation";
import { getEffectiveMusicProvider } from "@/lib/music/platformSettings";
import { musicDeckPath } from "@/lib/music/providerSegments";

export const dynamic = "force-dynamic";

export default async function LegacySpotifyDeckRedirect() {
  const { provider } = await getEffectiveMusicProvider();
  redirect(musicDeckPath(provider));
}
