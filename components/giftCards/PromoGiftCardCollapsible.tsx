"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import GiftCardApplyFields, {
  type GiftCardApplyState,
} from "@/components/giftCards/GiftCardApplyFields";

export type AppliedPromoDisplay = {
  code: string;
  discountedSubtotal?: number;
};

type PromoGiftCardCollapsibleProps = {
  orderTotal: number;
  showPromo?: boolean;
  promoCodeInput?: string;
  onPromoCodeInputChange?: (value: string) => void;
  appliedPromo?: AppliedPromoDisplay | null;
  promoError?: string;
  promoLoading?: boolean;
  onApplyPromo?: () => void;
  onRemovePromo?: () => void;
  appliedGiftCard?: GiftCardApplyState | null;
  onGiftCardApplied: (state: GiftCardApplyState | null) => void;
  mutuallyExclusiveWithPromo?: boolean;
  promoFullyCoversOrder?: boolean;
  giftCardDisabled?: boolean;
  className?: string;
};

const applyButtonClass =
  "shrink-0 rounded-md border border-yellow-400 bg-yellow-400 px-4 py-2 text-sm font-semibold text-neutral-900 shadow-[0_0_12px_rgba(242,201,76,0.35)] transition-colors hover:bg-yellow-300 disabled:border-neutral-600 disabled:bg-neutral-700 disabled:text-neutral-300 disabled:shadow-none";

export default function PromoGiftCardCollapsible({
  orderTotal,
  showPromo = true,
  promoCodeInput = "",
  onPromoCodeInputChange = () => {},
  appliedPromo = null,
  promoError = "",
  promoLoading = false,
  onApplyPromo = () => {},
  onRemovePromo = () => {},
  appliedGiftCard = null,
  onGiftCardApplied,
  mutuallyExclusiveWithPromo = true,
  promoFullyCoversOrder = false,
  giftCardDisabled,
  className = "",
}: PromoGiftCardCollapsibleProps) {
  const [open, setOpen] = useState(false);

  const title = showPromo ? "Promotion or gift card" : "Gift card";
  const hasApplied = Boolean(appliedPromo || appliedGiftCard);

  const summaryParts: string[] = [];
  if (appliedPromo) summaryParts.push(`Promo: ${appliedPromo.code}`);
  if (appliedGiftCard) {
    summaryParts.push(
      `Gift card: $${appliedGiftCard.amountToApply.toFixed(2)} applied`
    );
  }

  return (
    <div
      className={`rounded-lg border border-neutral-700 bg-neutral-800 ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-6"
      >
        <div className="min-w-0">
          <span className="text-base font-semibold text-white sm:text-lg">
            {title}
          </span>
          {!open && hasApplied && (
            <p className="mt-0.5 truncate text-sm text-green-400">
              {summaryParts.join(" · ")}
            </p>
          )}
          {!open && !hasApplied && (
            <p className="mt-0.5 text-sm text-gray-500">
              Expand to enter a code
            </p>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-yellow-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-neutral-700 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
          {showPromo && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-200">
                Promotion code
              </p>
              {appliedPromo ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-green-400">
                      Applied: {appliedPromo.code}
                      {appliedPromo.discountedSubtotal != null && (
                        <span className="ml-1 text-gray-300">
                          — Amount due: $
                          {appliedPromo.discountedSubtotal.toFixed(2)}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={onRemovePromo}
                      className="text-sm text-gray-400 underline hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                  {promoFullyCoversOrder && (
                    <p className="text-sm text-green-400">
                      Your total after discount is $0. No payment required.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => onPromoCodeInputChange(e.target.value)}
                    placeholder="Enter promotion code"
                    className="min-w-0 flex-1 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    disabled={promoLoading || !!appliedGiftCard}
                  />
                  <button
                    type="button"
                    onClick={onApplyPromo}
                    disabled={promoLoading || !!appliedGiftCard || !promoCodeInput.trim()}
                    className={applyButtonClass}
                  >
                    {promoLoading ? "Checking…" : "Apply"}
                  </button>
                </div>
              )}
              {promoError && (
                <p className="text-sm text-red-400" role="alert">
                  {promoError}
                </p>
              )}
            </div>
          )}

          {showPromo && mutuallyExclusiveWithPromo && (
            <p className="text-xs text-gray-500">
              Promotion codes and gift cards cannot be combined—only one can be
              applied per order.
            </p>
          )}

          <GiftCardApplyFields
            embedded
            orderTotal={orderTotal}
            disabled={giftCardDisabled || (!!appliedPromo && mutuallyExclusiveWithPromo)}
            promoActive={!!appliedPromo}
            mutuallyExclusiveWithPromo={mutuallyExclusiveWithPromo}
            onApplied={onGiftCardApplied}
          />
        </div>
      )}
    </div>
  );
}