import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Retrieve the Stripe session to get metadata
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (!session.metadata || session.metadata.payment_type !== "merch_order") {
      return NextResponse.json(
        { error: "Session metadata not found or invalid" },
        { status: 404 }
      );
    }

    const metadata = session.metadata;
    const email = metadata.email;
    const total = Number(metadata.total);

    if (!email || !total) {
      return NextResponse.json(
        { error: "Missing email or total in session metadata" },
        { status: 400 }
      );
    }

    // Look up the order by email, total, and status
    // Order by created_at desc to get the most recent one
    const { data: order, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("*")
      .eq("email", email)
      .eq("total", total)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !order) {
      // Order not found yet - webhook might still be processing
      return NextResponse.json(
        { error: "Order not found", pending: true },
        { status: 404 }
      );
    }

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error("Error looking up merch order confirmation:", error);
    return NextResponse.json(
      { error: "Failed to look up order", details: error.message },
      { status: 500 }
    );
  }
}
