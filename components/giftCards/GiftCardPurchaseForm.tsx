"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ChoiceCards from "@/components/ChoiceCards";

const PRESETS = [25, 50, 75, 100];
const MIN_DOLLARS = 5;
const MAX_DOLLARS = 500;

function parseWholeDollars(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return NaN;
  return parseInt(trimmed, 10);
}

function isValidPurchaseAmount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_DOLLARS && n <= MAX_DOLLARS;
}

const inputClass =
  "w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary";

export default function GiftCardPurchaseForm() {
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [purchasedForSelf, setPurchasedForSelf] = useState(true);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [scheduleDelivery, setScheduleDelivery] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryHour, setDeliveryHour] = useState(9);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "cash">("stripe");
  const [linkAccountPrompt, setLinkAccountPrompt] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCash, setSuccessCash] = useState(false);

  useEffect(() => {
    void supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      setSessionToken(session?.access_token ?? null);
      if (session?.user?.email) setBuyerEmail(session.user.email);
    });
  }, []);

  const effectiveAmount = useCustom
    ? parseWholeDollars(customAmount)
    : amount ?? NaN;

  const hasValidAmount = isValidPurchaseAmount(
    useCustom ? effectiveAmount : amount ?? NaN
  );
  const displayAmount =
    useCustom && hasValidAmount
      ? effectiveAmount
      : amount !== null && hasValidAmount
        ? amount
        : null;

  const submit = async () => {
    setError(null);
    if (!hasValidAmount) {
      setError(
        `Choose a preset or enter a whole dollar amount ($${MIN_DOLLARS}–$${MAX_DOLLARS}).`
      );
      return;
    }
    const purchaseAmount = useCustom ? effectiveAmount : amount!;
    if (!buyerEmail.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!purchasedForSelf && !recipientEmail.trim()) {
      setError("Please enter the recipient's email.");
      return;
    }
    if (purchasedForSelf && !sessionToken && linkAccountPrompt === false) {
      setLinkAccountPrompt(true);
      return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const res = await fetch("/api/gift-cards/purchase", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: purchaseAmount,
          purchasedForSelf,
          buyerName,
          buyerEmail,
          recipientName: purchasedForSelf ? buyerName : recipientName,
          recipientEmail: purchasedForSelf ? buyerEmail : recipientEmail,
          personalMessage,
          scheduleDelivery: !purchasedForSelf && scheduleDelivery,
          sendNow: purchasedForSelf || !scheduleDelivery,
          deliveryDate,
          deliveryHour,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Purchase failed");
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (data.pendingCash) {
        setSuccessCash(true);
      }
    } catch {
      setError("Purchase failed");
    } finally {
      setLoading(false);
    }
  };

  if (successCash) {
    return (
      <div className="bg-neutral-800 rounded-lg p-8 text-center shadow-[0_0_25px_rgba(242,201,76,0.15)]">
        <h2 className="text-2xl font-bold text-primary mb-4">Request received</h2>
        <p className="text-gray-300 mb-6">
          We&apos;ll finalize your gift card after we confirm your cash payment.
          You&apos;ll receive an email once it&apos;s active.
        </p>
        <Link
          href="/merch"
          className="inline-block btn-signup py-3 px-8 font-semibold transition-opacity hover:opacity-90"
        >
          Back to merch
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Amount</h2>
        <div className="flex flex-wrap gap-3">
          {PRESETS.map((p) => {
            const selected = !useCustom && amount === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setUseCustom(false);
                  setAmount(p);
                }}
                className={`min-w-[4.5rem] rounded-lg px-5 py-3 text-base font-bold transition-all duration-200 border ${
                  selected
                    ? "border-yellow-400 bg-yellow-400 text-neutral-900 shadow-[0_0_12px_rgba(242,201,76,0.45)]"
                    : "bg-neutral-700 text-white border-neutral-600 hover:border-yellow-400/60 hover:shadow-[0_0_12px_rgba(242,201,76,0.2)]"
                }`}
              >
                ${p}
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={useCustom}
            onChange={(e) => {
              const checked = e.target.checked;
              setUseCustom(checked);
              if (checked) setAmount(null);
              else setCustomAmount("");
            }}
            className="w-4 h-4 text-primary focus:ring-primary border-neutral-600 bg-neutral-700 rounded"
          />
          Custom amount (whole dollars, ${MIN_DOLLARS}–${MAX_DOLLARS})
        </label>
        {useCustom && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Custom amount
            </label>
            <input
              type="number"
              min={MIN_DOLLARS}
              max={MAX_DOLLARS}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              className={inputClass}
              value={customAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d+$/.test(v)) setCustomAmount(v);
              }}
              placeholder="e.g. 30"
            />
          </div>
        )}
        <p className="mt-4 text-xl font-bold text-primary">
          Gift card value:{" "}
          {displayAmount !== null
            ? `$${displayAmount.toLocaleString("en-US")}`
            : "—"}
        </p>
      </div>

      <div className="bg-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Who is this for?</h2>
        <ChoiceCards
          name="giftRecipient"
          aria-label="Who is this gift card for"
          value={purchasedForSelf ? "self" : "gift"}
          onChange={(v) => {
            setPurchasedForSelf(v === "self");
            setLinkAccountPrompt(false);
          }}
          options={[
            {
              value: "self",
              label: "Myself",
              description: "You will receive the gift card code by email.",
            },
            {
              value: "gift",
              label: "Someone else",
              description:
                "The recipient gets the code; you get a confirmation without the code.",
            },
          ]}
        />
      </div>

      {linkAccountPrompt && !sessionToken && purchasedForSelf && (
        <div className="bg-neutral-800 rounded-lg p-6 border border-primary/30">
          <p className="text-gray-200 mb-4">
            Do you have a CCS account? Sign in to link this gift card to your
            profile.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/auth?redirect=/merch/gift-cards"
              className="btn-signup text-sm px-4 py-2 rounded-md"
            >
              Sign in
            </Link>
            <button
              type="button"
              className="text-sm text-gray-400 hover:text-white underline"
              onClick={() => {
                setLinkAccountPrompt(false);
                void submit();
              }}
            >
              Continue without account
            </button>
          </div>
        </div>
      )}

      <div className="bg-neutral-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white mb-2">Your information</h2>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Your name
          </label>
          <input
            type="text"
            className={inputClass}
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="First and last name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Your email *
          </label>
          <input
            type="email"
            required
            className={inputClass}
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </div>

      {!purchasedForSelf && (
        <div className="bg-neutral-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-2">Recipient</h2>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Recipient name
            </label>
            <input
              type="text"
              className={inputClass}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Recipient email *
            </label>
            <input
              type="email"
              className={inputClass}
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Personal message (optional)
            </label>
            <textarea
              rows={4}
              className={`${inputClass} resize-y`}
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              maxLength={1000}
              placeholder="Add a note to include in the recipient email"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleDelivery}
              onChange={(e) => setScheduleDelivery(e.target.checked)}
              className="w-4 h-4 text-primary focus:ring-primary border-neutral-600 bg-neutral-700 rounded"
            />
            Schedule when they receive the email
          </label>
          {scheduleDelivery && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Delivery date
                </label>
                <input
                  type="date"
                  className={inputClass}
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Delivery time (Central)
                </label>
                <select
                  className={inputClass}
                  value={deliveryHour}
                  onChange={(e) => setDeliveryHour(Number(e.target.value))}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h === 0
                        ? "12:00 AM"
                        : h < 12
                          ? `${h}:00 AM`
                          : h === 12
                            ? "12:00 PM"
                            : `${h - 12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Payment</h2>
        <ChoiceCards
          name="giftCardPayment"
          aria-label="Payment method"
          value={paymentMethod}
          onChange={(v) => setPaymentMethod(v as "stripe" | "cash")}
          options={[
            {
              value: "stripe",
              label: "Pay online (Stripe)",
              description: "Credit or debit card — gift card is active immediately.",
            },
            {
              value: "cash",
              label: "Pay with cash",
              description:
                "Your gift card is finalized after a CCS admin confirms payment. No emails until then.",
            },
          ]}
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={loading || !hasValidAmount}
        onClick={() => void submit()}
        className="w-full btn-signup py-3 px-6 text-lg font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? "Processing…"
          : hasValidAmount
            ? `Purchase $${displayAmount!.toLocaleString("en-US")} gift card`
            : "Choose an amount"}
      </button>
      {!hasValidAmount && (
        <p className="text-center text-xs text-gray-500">
          Choose a preset or enter whole dollars (${MIN_DOLLARS}–${MAX_DOLLARS}).
        </p>
      )}
    </div>
  );
}