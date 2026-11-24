import { notFound, redirect } from "next/navigation";
import DjDeckPageClient from "@/app/spotify/deck/DjDeckPageClient";
import { getEffectiveMusicProvider } from "@/lib/music/platformSettings";
import {
  providerToUrlSegment,
  urlSegmentToProvider,
} from "@/lib/music/providerSegments";

export const dynamic = "force-dynamic";

export default async function MusicDeckProviderPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider: segment } = await params;
  if (!urlSegmentToProvider(segment)) {
    notFound();
  }

  const { provider } = await getEffectiveMusicProvider();
  const canonical = providerToUrlSegment(provider);
  if (segment !== canonical) {
    redirect(`/music/deck/${canonical}`);
  }

  return <DjDeckPageClient />;
}
