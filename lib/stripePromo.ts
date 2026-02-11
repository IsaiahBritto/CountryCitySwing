import { getStripe } from "@/lib/stripe";
import { getDiscountedSubtotalFromCoupon, roundCurrency } from "@/lib/utils/paymentHelpers";

/**
 * Resolve a Stripe promotion code by ID to its coupon and return the discounted amount (dollars).
 * Uses expand, lastResponse, second retrieve, REST API, and coupons.retrieve fallbacks.
 * Returns null if the promo cannot be resolved.
 */
export async function getDiscountedAmountForPromotion(
  promotionCodeId: string,
  amountDollars: number
): Promise<number | null> {
  const stripe = getStripe();
  let coupon: unknown = null;
  try {
    const promo = await stripe.promotionCodes.retrieve(promotionCodeId, {
      expand: ["coupon"],
    });
    const promoAny = promo as unknown as Record<string, unknown>;
    coupon = promoAny.coupon;
    if (!coupon || typeof coupon !== "object") {
      let couponId: string | undefined =
        typeof coupon === "string" && coupon.startsWith("coupon_") ? coupon : undefined;
      if (!couponId && promoAny.lastResponse) {
        try {
          const lr = promoAny.lastResponse as { body?: unknown };
          const body = typeof lr.body === "string" ? JSON.parse(lr.body as string) : lr.body;
          const c = (body as Record<string, unknown>)?.coupon;
          if (typeof c === "string" && c.startsWith("coupon_")) couponId = c;
        } catch (_) {
          /* ignore */
        }
      }
      if (!couponId) {
        const promoNoExpand = await stripe.promotionCodes.retrieve(promotionCodeId);
        const noExpandAny = promoNoExpand as unknown as Record<string, unknown>;
        if (typeof noExpandAny.coupon === "string" && noExpandAny.coupon.startsWith("coupon_")) {
          couponId = noExpandAny.coupon;
        } else if (noExpandAny.lastResponse) {
          try {
            const lr = noExpandAny.lastResponse as { body?: unknown };
            const body = typeof lr.body === "string" ? JSON.parse(lr.body as string) : lr.body;
            const c = (body as Record<string, unknown>)?.coupon;
            if (typeof c === "string" && c.startsWith("coupon_")) couponId = c;
          } catch (_) {
            /* ignore */
          }
        }
      }
      if (!couponId) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        try {
          const res = await fetch(
            `https://api.stripe.com/v1/promotion_codes/${encodeURIComponent(promotionCodeId)}`,
            { headers: { Authorization: `Bearer ${secretKey ?? ""}` } }
          );
          const data = (await res.json()) as Record<string, unknown>;
          const couponRef = data?.coupon ?? data?.promotion ?? data?.coupon_id;
          if (typeof couponRef === "string" && couponRef.length > 0) {
            couponId = couponRef;
          } else if (couponRef && typeof couponRef === "object" && !Array.isArray(couponRef)) {
            const pr = couponRef as Record<string, unknown>;
            const innerId = pr.coupon ?? pr.coupon_id ?? (typeof pr.id === "string" ? pr.id : null);
            if (typeof innerId === "string" && innerId.length > 0) {
              couponId = innerId;
            } else if (innerId && typeof innerId === "object" && !Array.isArray(innerId)) {
              coupon = innerId;
            } else if (pr.amount_off != null || pr.percent_off != null) {
              coupon = couponRef;
            }
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (!coupon && typeof couponId === "string" && couponId.length > 0) {
        try {
          coupon = await stripe.coupons.retrieve(couponId);
        } catch (_) {
          /* ignore */
        }
      }
    }
    if (coupon && typeof coupon === "object") {
      const couponObj = coupon as Record<string, unknown>;
      const innerCoupon = couponObj.coupon ?? couponObj.coupon_id;
      const couponForDiscount =
        innerCoupon && typeof innerCoupon === "object" && !Array.isArray(innerCoupon)
          ? innerCoupon
          : coupon;
      const discounted = getDiscountedSubtotalFromCoupon(couponForDiscount, amountDollars);
      return roundCurrency(discounted);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}
