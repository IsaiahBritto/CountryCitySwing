export default function Footer() {
  return (
    <footer className="bg-neutral-900 border-t border-neutral-700 py-6 text-center text-gray-400">
      <p>
        © {new Date().getFullYear()} Country City Swing — Nashville, TN. All rights reserved.
      </p>
      <p className="mt-1 text-sm">
        Built with ❤️ and faith. Dance for His glory.
      </p>
    </footer>
  );
}
