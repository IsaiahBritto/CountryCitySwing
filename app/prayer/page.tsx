import PrayerForm from "../../components/PrayerForm";

export default function Prayer() {
  return (
    <section className="max-w-xl mx-auto text-center">
      <h2 className="text-3xl font-semibold text-primary mb-6">Prayer Request</h2>
      <p className="text-gray-300 mb-8">
        You can submit a prayer request anonymously, and it will be sent directly to our team.
      </p>
      <PrayerForm />
    </section>
  );
}
