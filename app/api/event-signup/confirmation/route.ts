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

    if (!session.metadata) {
      return NextResponse.json(
        { error: "Session metadata not found" },
        { status: 404 }
      );
    }

    const metadata = session.metadata;
    const email = metadata.email;
    const eventId = metadata.event_id;

    if (!email || !eventId) {
      return NextResponse.json(
        { error: "Missing email or event ID in session metadata" },
        { status: 400 }
      );
    }

    // Look up the signup by email, event_id, and payment_method
    // Order by created_at desc to get the most recent one
    const { data: signup, error: fetchError } = await supabaseServer
      .from("signups")
      .select("*")
      .eq("email", email)
      .eq("event_id", eventId)
      .eq("payment_method", "Stripe")
      .eq("paid", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !signup) {
      // Signup not found yet - webhook might still be processing
      return NextResponse.json(
        { error: "Signup not found", pending: true },
        { status: 404 }
      );
    }

    return NextResponse.json({ signup });
  } catch (error: any) {
    console.error("Error looking up signup confirmation:", error);
    return NextResponse.json(
      { error: "Failed to look up signup", details: error.message },
      { status: 500 }
    );
  }
}
