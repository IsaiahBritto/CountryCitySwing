import { redirect } from "next/navigation";
import { getEffectiveMusicProvider } from "@/lib/music/platformSettings";
import { providerToUrlSegment } from "@/lib/music/providerSegments";

export const dynamic = "force-dynamic";

export default async function LegacySpotifyAdminRedirect() {
  const { provider } = await getEffectiveMusicProvider();
  redirect(`/admin/music/${providerToUrlSegment(provider)}`);
}
