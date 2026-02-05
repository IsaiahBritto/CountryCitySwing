import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

async function getUserFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
  const { data, error } = await client.auth.getUser(accessToken);
  const user = data?.user ?? null;
  return { user, error };
}

/**
 * GET - Fetch the current user's merch orders (by email).
 * Requires Authorization: Bearer <session access_token>.
 * Returns orders sorted by most recent first.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await getUserFromToken(accessToken);

    if (authError || !user?.email) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token or no email" },
        { status: 401 }
      );
    }

    const email = user.email.trim().toLowerCase();

    const { data: orders, error } = await supabaseServer
      .from("merch_orders")
      .select("id, first_name, last_name, email, delivery_method, items, subtotal, shipping, total, status, paid, payment_method, created_at")
      .ilike("email", email)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("My orders fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load orders", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: orders ?? [] });
  } catch (err) {
    console.error("My orders API error:", err);
    return NextResponse.json(
      { error: "Failed to load orders" },
      { status: 500 }
    );
  }
}
