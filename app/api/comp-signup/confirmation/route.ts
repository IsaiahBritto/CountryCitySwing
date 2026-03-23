import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const paymentType = session.metadata?.payment_type;
    const isComp =
      paymentType === "comp_signup" || paymentType === "comp_signup_cash_to_stripe";
    if (!isComp) {
      return NextResponse.json(
        { error: "Not a comp signup session" },
        { status: 400 }
      );
    }

    const compSignupId = session.metadata?.comp_signup_id || session.client_reference_id;
    if (!compSignupId) {
      return NextResponse.json(
        { error: "Comp signup ID not found in session" },
        { status: 400 }
      );
    }

    const { data: signup, error: fetchError } = await supabaseServer
      .from("comp_signups")
      .select("id,event_title,payment_method,paid")
      .eq("id", compSignupId)
      .single();

    if (fetchError || !signup) {
      return NextResponse.json(
        { error: "Comp signup not found", pending: true },
        { status: 404 }
      );
    }

    return NextResponse.json({ signup });
  } catch (error: any) {
    console.error("Comp signup confirmation lookup error:", error);
    return NextResponse.json(
      { error: "Failed to look up comp signup", details: error?.message },
      { status: 500 }
    );
  }
}
