import { notFound, redirect } from "next/navigation";
import MusicAdminPageClient from "@/app/admin/music/MusicAdminPageClient";
import { getEffectiveMusicProvider } from "@/lib/music/platformSettings";
import {
  providerToUrlSegment,
  urlSegmentToProvider,
} from "@/lib/music/providerSegments";

export const dynamic = "force-dynamic";

export default async function AdminMusicProviderPage({
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
    redirect(`/admin/music/${canonical}`);
  }

  return <MusicAdminPageClient />;
}
