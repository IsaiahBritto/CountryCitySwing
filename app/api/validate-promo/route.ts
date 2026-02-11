import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getDiscountedAmountForPromotion } from "@/lib/stripePromo";
import { roundCurrency } from "@/lib/utils/paymentHelpers";

/**
 * POST /api/validate-promo
 * Body: { code: string, subtotal?: number }
 * Validates a promotion code with Stripe and returns the promotion code ID and discounted amount.
 * subtotal = event cost (normal rate or CCS team price); discount is resolved by promotionCodeId.
 */
export async function POST(req: NextRequest) {
  try {
    const { code, subtotal } = await req.json();
    const trimmed = typeof code === "string" ? code.trim() : "";
    if (!trimmed) {
      return NextResponse.json(
        { valid: false, message: "Please enter a promotion code." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const { data: promotionCodes } = await stripe.promotionCodes.list({
      code: trimmed,
      limit: 1,
    });

    const promo = promotionCodes[0];
    if (!promo) {
      return NextResponse.json(
        { valid: false, message: "This promotion code is not valid." },
        { status: 404 }
      );
    }

    if (!promo.active) {
      return NextResponse.json(
        { valid: false, message: "This promotion code is no longer active." },
        { status: 400 }
      );
    }

    const coupon = (promo as { coupon?: { valid?: boolean } | string }).coupon;
    if (typeof coupon === "object" && coupon?.valid === false) {
      return NextResponse.json(
        { valid: false, message: "This promotion code has expired." },
        { status: 400 }
      );
    }

    // Resolve discount by promotionCodeId and apply to event cost (normal or CCS team price)
    const subtotalNum =
      typeof subtotal === "number"
        ? subtotal
        : typeof subtotal === "string"
          ? parseFloat(subtotal)
          : NaN;
    let discountedSubtotal: number | undefined;
    if (!Number.isNaN(subtotalNum) && subtotalNum >= 0) {
      const discounted = await getDiscountedAmountForPromotion(promo.id, subtotalNum);
      if (discounted !== null && Number.isFinite(discounted)) {
        discountedSubtotal = roundCurrency(discounted);
      }
    }

    const payload: {
      valid: true;
      promotionCodeId: string;
      code: string;
      discountedSubtotal?: number;
    } = {
      valid: true,
      promotionCodeId: promo.id,
      code: promo.code,
    };
    if (discountedSubtotal !== undefined && Number.isFinite(discountedSubtotal)) {
      payload.discountedSubtotal = discountedSubtotal;
    }

    const res = NextResponse.json(payload);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err: unknown) {
    console.error("Validate promo error:", err);
    return NextResponse.json(
      { valid: false, message: "Could not validate promotion code." },
      { status: 500 }
    );
  }
}
