import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";

async function getAdminFromToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(accessToken);
  return { user, error };
}

function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid authorization header" },
      { status: 401 }
    );
  }
  return authHeader.replace("Bearer ", "");
}

async function checkAdmin(accessToken: string) {
  const { user, error } = await getAdminFromToken(accessToken);
  if (error || !user) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" },
      { status: 401 }
    );
  }
  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 403 }
    );
  }
  const roleLower = (profile.role || "").toLowerCase();
  if (roleLower !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 }
    );
  }
  return null;
}

async function runBackfill(req: NextRequest) {
  const token = requireAdmin(req);
  if (token instanceof NextResponse) return token;
  const authErr = await checkAdmin(token);
  if (authErr) return authErr;

  const { data: orders, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("id, stripe_session_id")
      .eq("payment_method", "stripe")
      .eq("paid", true)
      .not("stripe_session_id", "is", null)
      .or("stripe_tax_amount.is.null,stripe_processing_fee.is.null");

  if (fetchError) {
    console.error("backfill-merch-stripe-fees: fetch orders", fetchError);
    return NextResponse.json(
      { error: "Failed to fetch merch orders", details: fetchError.message },
      { status: 500 }
    );
  }

  if (!orders?.length) {
    return NextResponse.json({
      success: true,
      updated: 0,
      message: "No orders need backfill (all Stripe-paid merch orders already have tax/fee).",
    });
  }

  const stripe = getStripe();
  const BATCH_SIZE = 50;
  const updates: { id: string; stripe_tax_amount: number; stripe_processing_fee: number }[] = [];
  const errors: { orderId: string; error: string }[] = [];

  for (const order of orders) {
    const sessionId = order.stripe_session_id as string;
    if (!sessionId) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: [],
      });
      const taxAmount =
        session.total_details?.amount_tax != null
          ? session.total_details.amount_tax / 100
          : 0;
      const processingFee = Number((session.metadata?.processing_fee as string) || 0);
      updates.push({
        id: order.id,
        stripe_tax_amount: taxAmount,
        stripe_processing_fee: processingFee,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ orderId: order.id, error: msg });
    }
  }
  let updated = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((u) =>
        supabaseServer
          .from("merch_orders")
          .update({
            stripe_tax_amount: u.stripe_tax_amount,
            stripe_processing_fee: u.stripe_processing_fee,
            updated_at: now,
          })
          .eq("id", u.id)
      )
    );
    for (let idx = 0; idx < results.length; idx++) {
      if (results[idx].error) {
        errors.push({ orderId: batch[idx].id, error: results[idx].error!.message });
      } else {
        updated += 1;
      }
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    total: orders.length,
    errors: errors.length ? errors : undefined,
    message:
      errors.length > 0
        ? `Backfilled ${updated} of ${orders.length} orders. ${errors.length} failed.`
        : `Backfilled ${updated} order(s).`,
  });
}

/**
 * GET or POST /api/admin/backfill-merch-stripe-fees
 * Backfill stripe_tax_amount and stripe_processing_fee for existing paid Stripe merch orders.
 * Admin only. Send Authorization: Bearer <token>.
 */
export async function GET(req: NextRequest) {
  try {
    return await runBackfill(req);
  } catch (e) {
    console.error("backfill-merch-stripe-fees GET:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await runBackfill(req);
  } catch (e) {
    console.error("backfill-merch-stripe-fees POST:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
