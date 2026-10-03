import CompPlaylistMakerClient from "@/components/comps/admin/CompPlaylistMakerClient";

export default async function EventPlaylistsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <CompPlaylistMakerClient eventId={eventId} />;
}
