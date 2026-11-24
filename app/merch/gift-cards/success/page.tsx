import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

export default function GiftCardSuccessPage() {
  return (
    <section className="max-w-2xl mx-auto text-center py-8">
      <CheckCircleIcon className="w-16 h-16 text-primary mx-auto mb-6" />
      <h1 className="gold-wave text-3xl font-extrabold pb-2 mb-4">
        Thank you!
      </h1>
      <p className="text-gray-300 mb-8">
        Your gift card purchase is complete. Check your email for confirmation
        and delivery details.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/merch"
          className="inline-block btn-signup py-3 px-8 font-semibold transition-opacity hover:opacity-90"
        >
          Back to merch
        </Link>
        <Link
          href="/merch/gift-cards"
          className="inline-block py-3 px-8 font-semibold rounded-md border border-neutral-600 text-gray-300 hover:border-primary hover:text-primary transition-colors"
        >
          Buy another
        </Link>
      </div>
    </section>
  );
}