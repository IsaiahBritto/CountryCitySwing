"use client";

import { useState } from "react";

type Props = {
  orderTotal: number;
  disabled?: boolean;
  embedded?: boolean;
  onApplied: (state: GiftCardApplyState | null) => void;
  mutuallyExclusiveWithPromo?: boolean;
  promoActive?: boolean;
};

export type GiftCardApplyState = {
  code: string;
  balance: number;
  maxApplicable: number;
  amountToApply: number;
  giftCardId: string;
  mode: "full" | "custom";
};

export default function GiftCardApplyFields({
  orderTotal,
  disabled,
  embedded = false,
  onApplied,
  mutuallyExclusiveWithPromo,
  promoActive,
}: Props) {
  const [codeInput, setCodeInput] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [giftCardId, setGiftCardId] = useState<string | null>(null);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [customAmount, setCustomAmount] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const clear = () => {
    setBalance(null);
    setGiftCardId(null);
    setFeedback(null);
    onApplied(null);
  };

  const apply = async () => {
    if (mutuallyExclusiveWithPromo && promoActive) {
      setFeedback({
        type: "error",
        text: "Remove promotion code before using a gift card.",
      });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gift-cards/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput, orderTotal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        setFeedback({
          type: "error",
          text:
            data.message ||
            "We couldn't find a gift card with that code. Please check the code and try again.",
        });
        setBalance(null);
        setGiftCardId(null);
        onApplied(null);
        return;
      }
      const max = Number(data.maxApplicable) || 0;
      setBalance(Number(data.balance));
      setGiftCardId(data.giftCardId);
      const custom = parseFloat(customAmount);
      let amountToApply = max;
      if (mode === "custom" && !Number.isNaN(custom) && custom > 0) {
        amountToApply = Math.min(max, custom);
      }
      setFeedback({
        type: "success",
        text: `Balance $${Number(data.balance).toFixed(2)} — applying $${amountToApply.toFixed(2)}`,
      });
      onApplied({
        code: codeInput.trim(),
        balance: Number(data.balance),
        maxApplicable: max,
        amountToApply,
        giftCardId: data.giftCardId,
        mode,
      });
    } catch {
      setFeedback({
        type: "error",
        text: "Could not validate gift card. Please try again.",
      });
      setBalance(null);
      setGiftCardId(null);
      onApplied(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? "space-y-3"
          : "space-y-3 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4"
      }
    >
      <p className="text-sm font-medium text-neutral-200">Gift card</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          className="flex-1 rounded-md border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm text-white"
          placeholder="CCS-XXXX-XXXX"
          value={codeInput}
          disabled={disabled || loading}
          onChange={(e) => setCodeInput(e.target.value)}
        />
        <button
          type="button"
          disabled={disabled || loading || !codeInput.trim()}
          onClick={() => void apply()}
          className="shrink-0 rounded-md border border-yellow-400 bg-yellow-400 px-5 py-2 text-sm font-semibold text-neutral-900 shadow-[0_0_12px_rgba(242,201,76,0.35)] transition-colors hover:bg-yellow-300 disabled:border-neutral-600 disabled:bg-neutral-700 disabled:text-neutral-300 disabled:shadow-none disabled:hover:bg-neutral-700"
        >
          {loading ? "Checking…" : "Apply"}
        </button>
      </div>
      {balance != null && (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="radio"
            checked={mode === "full"}
            onChange={() => setMode("full")}
          />
          Apply full amount (up to order total)
        </label>
      )}
      {balance != null && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="radio"
              checked={mode === "custom"}
              onChange={() => setMode("custom")}
            />
            Custom amount
          </label>
          {mode === "custom" && (
            <input
              type="number"
              min={0.01}
              step={0.01}
              className="w-full rounded-md border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm text-white"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
            />
          )}
          <button
            type="button"
            className="text-xs font-medium text-yellow-400 underline hover:text-yellow-300"
            onClick={() => void apply()}
          >
            Recalculate applied amount
          </button>
        </div>
      )}
      {feedback && (
        <p
          role="alert"
          className={`text-sm ${
            feedback.type === "error" ? "text-red-300" : "text-green-300"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}