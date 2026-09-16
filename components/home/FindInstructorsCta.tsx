import { CcsButton, CcsHeading } from "@/components/ccs";

export default function FindInstructorsCta() {
  return (
    <section className="max-w-3xl mx-auto text-center px-4 pt-8 pb-4">
      <CcsHeading level={2} variant="goldWave" className="mb-3">
        Find Instructors
      </CcsHeading>
      <p className="ccs-body text-gray-300 mb-6">
        Browse our instructor directory to connect with teachers across the country.
      </p>
      <CcsButton href="/instructors" variant="ghostGold">
        Instructors →
      </CcsButton>
    </section>
  );
}
