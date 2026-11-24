import GiftCardPurchaseForm from "@/components/giftCards/GiftCardPurchaseForm";
import Link from "next/link";

export default function GiftCardsPage() {
  return (
    <section className="max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href="/merch"
          className="text-sm text-gray-400 hover:text-primary transition-colors"
        >
          ← Back to merch
        </Link>
      </div>
      <h1 className="gold-wave page-title font-extrabold pb-2 mb-3">
        Gift Card
      </h1>
      <p className="text-gray-400 mb-8 max-w-2xl">
        Give any amount from $5 up. Redeem on classes, events, merch, and more
        anywhere on Country City Swing.
      </p>
      <GiftCardPurchaseForm />
    </section>
  );
}