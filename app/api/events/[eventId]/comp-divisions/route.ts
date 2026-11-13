import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/** Public list of on-event competition divisions for signup UI. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type, test_comp")
    .eq("event_id", eventId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Failed to load divisions" }, { status: 500 });
  }

  const competitions = (data ?? []).filter((c) => !c.test_comp);
  return NextResponse.json({ competitions });
}
