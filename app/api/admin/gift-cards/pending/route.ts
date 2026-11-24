import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,initial_amount,buyer_email,buyer_name,recipient_email,recipient_name,payment_method,paid,status,created_at,purchased_for_self"
    )
    .eq("payment_method", "cash")
    .eq("paid", false)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ cards: data ?? [] });
}