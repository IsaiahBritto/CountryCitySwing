import { MusicPlatformProvider } from "@/components/music/MusicPlatformProvider";
import { getEffectiveMusicProvider } from "@/lib/music/platformSettings";

export const dynamic = "force-dynamic";

export default async function MusicDeckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { provider, source } = await getEffectiveMusicProvider();
  return (
    <MusicPlatformProvider initialProvider={provider} initialSource={source}>
      {children}
    </MusicPlatformProvider>
  );
}
