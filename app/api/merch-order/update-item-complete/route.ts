import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, itemIndex, complete } = body;

    if (orderId == null || itemIndex == null || typeof complete !== "boolean") {
      return NextResponse.json(
        { error: "orderId, itemIndex, and complete (boolean) are required" },
        { status: 400 }
      );
    }

    const { data: currentOrder, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("id, items")
      .eq("id", orderId)
      .single();

    if (fetchError || !currentOrder) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const items = Array.isArray(currentOrder.items) ? [...currentOrder.items] : [];
    if (itemIndex < 0 || itemIndex >= items.length) {
      return NextResponse.json(
        { error: "Invalid item index" },
        { status: 400 }
      );
    }

    const updatedItems = items.map((item: any, i: number) =>
      i === itemIndex ? { ...item, complete } : item
    );

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("merch_orders")
      .update({
        items: updatedItems,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating item complete:", updateError);
      return NextResponse.json(
        { error: "Failed to update item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    console.error("Update item complete error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
