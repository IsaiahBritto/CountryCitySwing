import { NextRequest, NextResponse } from "next/server";
import { isSiteAdmin, requireAuthenticatedProfile } from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  if (!isSiteAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("events")
    .update({
      approval_status: "rejected",
      approval_rejection_reason: reason,
      approval_reviewed_at: new Date().toISOString(),
      approval_reviewed_by: auth.userId,
    })
    .eq("id", id)
    .eq("host_kind", "community")
    .eq("approval_status", "pending")
    .select("id, approval_status, approval_rejection_reason")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Reject failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Event is not pending approval" },
      { status: 409 }
    );
  }

  return NextResponse.json({ event: data });
}
