import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const { orderId, paid } = await request.json();

    if (!orderId || typeof paid !== "boolean") {
      return NextResponse.json(
        { error: "Order ID and paid status (boolean) are required" },
        { status: 400 }
      );
    }

    // Update the paid status
    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("merch_orders")
      .update({
        paid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating paid status:", updateError);
      return NextResponse.json(
        { error: "Failed to update paid status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    console.error("Paid status update error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
