import { CcsButton, CcsHeading } from "@/components/ccs";

export default function NotFound() {
  return (
    <section className="text-center max-w-xl mx-auto py-16 px-4">
      <CcsHeading level={1} variant="goldWave" className="mb-4">
        Page Not Found
      </CcsHeading>
      <p className="ccs-body text-gray-300 mb-8">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <CcsButton href="/" variant="solidGold">
        Back to Home
      </CcsButton>
    </section>
  );
}
