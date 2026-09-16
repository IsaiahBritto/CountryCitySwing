export default function Footer() {
  return (
    <footer className="bg-bg-nav border-t border-neutral-700 py-6 text-center text-text-muted">
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
