import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 border-t border-neutral-700 py-6 text-center text-gray-400">
      <p className="text-sm mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link href="/privacy" className="text-gray-400 hover:text-primary hover:underline">
          Privacy
        </Link>
        <span className="text-neutral-600" aria-hidden>
          ·
        </span>
        <Link href="/terms" className="text-gray-400 hover:text-primary hover:underline">
          Terms
        </Link>
        <span className="text-neutral-600" aria-hidden>
          ·
        </span>
        <Link href="/cookies" className="text-gray-400 hover:text-primary hover:underline">
          Cookies
        </Link>
      </p>
      <p className="text-sm mb-1">
        Questions?{" "}
        <a
          href="mailto:contact.us@countrycityswing.dance"
          className="text-primary hover:underline"
        >
          contact.us@countrycityswing.dance
        </a>
      </p>
      <p>
        © {new Date().getFullYear()} Country City Swing — Nashville, TN. All rights reserved.
      </p>
      <p className="mt-1 text-sm">
        Built with ❤️ and faith. Dance for His glory.
      </p>
    </footer>
  );
}
