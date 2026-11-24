import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeGiftCardCodeInput } from "@/lib/giftCards/code";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const normalized = normalizeGiftCardCodeInput(q);
  let query = supabaseServer.from("gift_cards").select("*");

  if (normalized.includes("CCS-")) {
    query = query.eq("code", normalized);
  } else if (q.includes("@")) {
    query = query.or(`buyer_email.eq.${q},recipient_email.eq.${q}`);
  } else {
    query = query.eq("id", q);
  }

  const { data: cards, error } = await query.limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (cards ?? []).map((c) => c.id);
  const { data: tx } =
    ids.length > 0
      ? await supabaseServer
          .from("gift_card_transactions")
          .select("*")
          .in("gift_card_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] };

  return NextResponse.json({ cards: cards ?? [], transactions: tx ?? [] });
}