import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const sessionId = searchParams.get("session_id");
    const orderId = searchParams.get("order_id");

    // Handle cash payment (order_id provided)
    if (orderId) {
      const { data: order, error: fetchError } = await supabaseServer
        .from("merch_orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (fetchError || !order) {
        console.error("Confirmation: Order not found for order_id", orderId, fetchError);
        return NextResponse.json(
          { error: "Order not found", pending: true },
          { status: 404 }
        );
      }

      return NextResponse.json({ order });
    }

    // Handle Stripe payment (session_id provided)
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID or Order ID is required" },
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

    // Look up the order by stripe_session_id (most reliable method)
    // This ensures we get the exact order created by this Stripe session
    const { data: order, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("*")
      .eq("stripe_session_id", sessionId)
      .single();

    if (fetchError || !order) {
      // Order not found yet - webhook might still be processing
      // Log the error for debugging
      console.error("Confirmation: Order not found for session", sessionId, fetchError);
      return NextResponse.json(
        { error: "Order not found", pending: true },
        { status: 404 }
      );
    }

    // Verify the order is paid
    if (!order.paid) {
      console.error("Confirmation: Order found but not marked as paid", order.id);
      return NextResponse.json(
        { error: "Order payment not confirmed", pending: true },
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
