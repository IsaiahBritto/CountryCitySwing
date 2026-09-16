import PrayerForm from "../../components/PrayerForm";
import PrayerTeamGrid from "../../components/prayer/PrayerTeamGrid";
import { CcsPageHeader, CcsHeading } from "@/components/ccs";

export default function Prayer() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <CcsPageHeader
        title="Prayer Request"
        subtitle="You can submit a prayer request anonymously, and it will be sent directly to our team."
      />
      <PrayerForm />

      <section className="mt-20 text-center">
        <CcsHeading level={2} variant="goldWave" className="mb-4">
          Looking for Prayer, Church, Bible Studies, Other?
        </CcsHeading>
        <p className="ccs-body text-gray-300 max-w-2xl mx-auto mb-6">
          Our team would love to connect with you. Reach out to any of us below — we&apos;re here
          to pray with you and help you find community.
        </p>
        <PrayerTeamGrid />
      </section>
    </div>
  );
}
