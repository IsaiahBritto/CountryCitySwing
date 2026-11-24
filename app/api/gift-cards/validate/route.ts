import { NextRequest, NextResponse } from "next/server";
import { validateGiftCard } from "@/lib/giftCards/validate";
import { roundCurrency } from "@/lib/utils/paymentHelpers";

export async function POST(req: NextRequest) {
  try {
    const { code, orderTotal } = await req.json();
    const result = await validateGiftCard(String(code ?? ""));
    if (!result.ok) {
      return NextResponse.json({ valid: false, message: result.message }, { status: 200 });
    }

    const total =
      typeof orderTotal === "number" && !Number.isNaN(orderTotal)
        ? roundCurrency(orderTotal)
        : null;
    const maxApplicable =
      total != null ? roundCurrency(Math.min(result.balance, total)) : result.balance;

    return NextResponse.json({
      valid: true,
      balance: result.balance,
      maxApplicable,
      giftCardId: result.card.id,
      maskedCode: result.maskedCode,
    });
  } catch (e) {
    console.error("gift card validate", e);
    return NextResponse.json({ valid: false, message: "Validation failed." }, { status: 500 });
  }
}