import { toVideoEmbedUrl } from "@/lib/team/videoEmbedUrl";

type Props = {
  videoUrl: string | null;
  title: string;
};

export default function InstructorVideoEmbed({ videoUrl, title }: Props) {
  const embedSrc = videoUrl ? toVideoEmbedUrl(videoUrl) : null;

  if (embedSrc) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
        <iframe
          src={embedSrc}
          title={title}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      className="aspect-video w-full rounded-lg bg-neutral-700"
      role="img"
      aria-label={`${title} video placeholder`}
    >
      <span className="sr-only">Video coming soon</span>
    </div>
  );
}
