import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { refundGiftCardPurchaseBalance } from "@/lib/giftCards/purchaseRefund";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { amount?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }

  const result = await refundGiftCardPurchaseBalance({
    giftCardId: id,
    amount,
    adminUserId: auth.userId,
    note: typeof body.note === "string" ? body.note : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    amountRefunded: result.amountRefunded,
    balanceAfter: result.balanceAfter,
    stripeRefundId: result.stripeRefundId,
  });
}