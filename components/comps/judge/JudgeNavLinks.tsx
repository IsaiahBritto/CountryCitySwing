import Link from "next/link";

export default function JudgeNavLinks({ className = "" }: { className?: string }) {
  return (
    <div className={"flex flex-wrap items-center gap-x-3 gap-y-1 text-xs " + className}>
      <Link href="/comps" className="text-neutral-500 hover:text-primary">
        ← Comps hub
      </Link>
      <span className="text-neutral-600">·</span>
      <Link href="/judge" className="text-neutral-500 hover:text-primary">
        My rounds
      </Link>
    </div>
  );
}
