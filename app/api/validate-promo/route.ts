import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/validate-promo
 * Body: { code: string }
 * Validates a promotion code with Stripe and returns the promotion code ID
 * so it can be pre-applied when creating a Checkout Session.
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
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

    // Optional: check coupon validity when expanded (e.g. not expired)
    const coupon = (promo as { coupon?: { valid?: boolean } | string }).coupon;
    if (typeof coupon === "object" && coupon?.valid === false) {
      return NextResponse.json(
        { valid: false, message: "This promotion code has expired." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      promotionCodeId: promo.id,
      code: promo.code,
    });
  } catch (err: unknown) {
    console.error("Validate promo error:", err);
    return NextResponse.json(
      { valid: false, message: "Could not validate promotion code." },
      { status: 500 }
    );
  }
}
