import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";

const SIGNUP_SELECT =
  "id,event_id,event_title,first_name,last_name,email,payment_method,paid";

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

    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (!session.metadata) {
      return NextResponse.json(
        { error: "Session metadata not found" },
        { status: 404 }
      );
    }

    const metadata = session.metadata;
    const paymentType = metadata.payment_type;

    if (paymentType === "cash_to_stripe") {
      const signupId = metadata.signup_id || session.client_reference_id;
      if (!signupId) {
        return NextResponse.json(
          { error: "Signup ID not found in session" },
          { status: 400 }
        );
      }

      const { data: signup, error: fetchError } = await supabaseServer
        .from("signups")
        .select(SIGNUP_SELECT)
        .eq("id", signupId)
        .single();

      if (fetchError || !signup) {
        return NextResponse.json(
          { error: "Signup not found", pending: true },
          { status: 404 }
        );
      }

      return NextResponse.json({ signup });
    }

    const email = metadata.email;
    const eventId = metadata.event_id;

    if (!email || !eventId) {
      return NextResponse.json(
        { error: "Missing email or event ID in session metadata" },
        { status: 400 }
      );
    }

    const { data: signup, error: fetchError } = await supabaseServer
      .from("signups")
      .select(SIGNUP_SELECT)
      .eq("email", email)
      .eq("event_id", eventId)
      .eq("payment_method", "Stripe")
      .eq("paid", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !signup) {
      return NextResponse.json(
        { error: "Signup not found", pending: true },
        { status: 404 }
      );
    }

    return NextResponse.json({ signup });
  } catch (error: unknown) {
    console.error("Error looking up signup confirmation:", error);
    return NextResponse.json(
      {
        error: "Failed to look up signup",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
