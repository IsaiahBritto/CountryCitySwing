import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

async function getUserFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
  const { data, error } = await client.auth.getUser(accessToken);
  return { user: data?.user ?? null, error };
}

/**
 * DELETE — Permanently delete the signed-in user's auth account (service role).
 * Profile and related rows may cascade per database FK rules.
 */
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const { user, error: authError } = await getUserFromToken(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[account/delete]", deleteError);
    return NextResponse.json(
      { error: deleteError.message || "Failed to delete account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
