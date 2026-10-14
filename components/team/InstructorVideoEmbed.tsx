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
      className="relative aspect-video w-full rounded-lg bg-neutral-700 flex items-center justify-center"
      role="img"
      aria-label={`${title} — video coming soon`}
    >
      <span
        className="text-sm sm:text-base font-semibold uppercase tracking-wider text-neutral-300/90 pointer-events-none select-none"
        aria-hidden="true"
      >
        Coming soon
      </span>
    </div>
  );
}
