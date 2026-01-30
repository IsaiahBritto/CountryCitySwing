import Link from "next/link";

export default function NotFound() {
  return (
    <section className="text-center max-w-xl mx-auto py-16 px-4">
      <h1 className="gold-wave text-4xl font-extrabold mb-4 pb-2">
        Page Not Found
      </h1>
      <p className="text-lg text-gray-300 mb-8">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link
        href="/"
        className="btn btn-primary inline-block px-6 py-3 rounded-md font-semibold"
      >
        Back to Home
      </Link>
    </section>
  );
}
