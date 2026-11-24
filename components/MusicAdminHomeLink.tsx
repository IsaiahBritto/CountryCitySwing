import Link from "next/link";

/** Admin-only entry from the home page to Music admin (redirects to active provider). */
export default function MusicAdminHomeLink({
  className = "",
}: {
  className?: string;
}) {
  return (
    <Link
      href="/spotify"
      className={
        "mx-auto flex max-w-xl items-center justify-center rounded-xl border border-neutral-600 bg-neutral-800/80 px-4 py-2.5 text-center text-sm font-semibold text-neutral-200 transition hover:border-primary/50 hover:bg-neutral-800 hover:text-primary " +
        className
      }
    >
      Music admin — DJ deck &amp; social playlists
    </Link>
  );
}
