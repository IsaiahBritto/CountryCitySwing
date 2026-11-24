import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { issueGiftCardAfterPayment } from "@/lib/giftCards/issue";
import {
  maybeSendRecipientNow,
  sendGiftCardBuyerConfirmation,
} from "@/lib/giftCards/delivery";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { data: card, error: fetchErr } = await supabaseServer
    .from("gift_cards")
    .select("id,payment_method,paid,status")
    .eq("id", id)
    .single();

  if (fetchErr || !card) {
    return NextResponse.json({ error: "Gift card not found" }, { status: 404 });
  }
  if (card.payment_method !== "cash") {
    return NextResponse.json({ error: "Not a cash gift card purchase" }, { status: 400 });
  }
  if (card.paid) {
    return NextResponse.json({ success: true, alreadyPaid: true });
  }

  const issued = await issueGiftCardAfterPayment({
    giftCardId: id,
    paymentConfirmedBy: auth.userId,
  });

  if (!issued.ok) {
    return NextResponse.json({ error: issued.error }, { status: 500 });
  }

  const { data: full } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,code,initial_amount,purchased_for_self,buyer_email,buyer_name,recipient_email,recipient_name,personal_message,deliver_at,deliver_timezone,recipient_email_status"
    )
    .eq("id", id)
    .single();

  if (full) {
    try {
      await sendGiftCardBuyerConfirmation(full, {
        includeCode: full.purchased_for_self,
      });
    } catch (e) {
      console.error("confirm-cash buyer email", e);
    }
    await maybeSendRecipientNow(id);
  }

  return NextResponse.json({ success: true, code: issued.code });
}