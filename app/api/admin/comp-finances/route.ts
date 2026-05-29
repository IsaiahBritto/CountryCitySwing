import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireFinanceAuth } from "@/lib/financeAuth";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    const [financesRes, judgesRes] = await Promise.all([
      supabaseServer
        .from("comp_finances")
        .select("studio_cost")
        .eq("event_id", eventId)
        .maybeSingle(),
      supabaseServer
        .from("comp_judge_payouts")
        .select("id, judge_name, amount_paid, paid, paid_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
    ]);

    if (financesRes.error) {
      console.error("comp-finances GET finances:", financesRes.error);
      return NextResponse.json(
        { error: "Failed to fetch comp finances" },
        { status: 500 }
      );
    }
    if (judgesRes.error) {
      console.error("comp-finances GET judges:", judgesRes.error);
      return NextResponse.json(
        { error: "Failed to fetch judge payouts" },
        { status: 500 }
      );
    }

    const studio_cost = financesRes.data
      ? Number(financesRes.data.studio_cost)
      : 0;
    const judges = (judgesRes.data || []).map((j) => ({
      id: j.id,
      judge_name: j.judge_name ?? "",
      amount_paid: Number(j.amount_paid) || 0,
      paid: !!j.paid,
      paid_at: j.paid_at ?? null,
    }));

    return NextResponse.json({
      data: { studio_cost, judges },
    });
  } catch (e) {
    console.error("comp-finances GET:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { event_id: eventId, studio_cost: studioCost, judges: judgesInput, mark_judge_paid: markJudgePaidId } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (typeof markJudgePaidId === "string" && markJudgePaidId.trim()) {
      const { error: updateErr } = await supabaseServer
        .from("comp_judge_payouts")
        .update({ paid: true, paid_at: now, updated_at: now })
        .eq("id", markJudgePaidId.trim())
        .eq("event_id", eventId);
      if (updateErr) {
        console.error("comp-finances PATCH mark_judge_paid:", updateErr);
        return NextResponse.json(
          { error: "Failed to mark judge as paid" },
          { status: 500 }
        );
      }
    }

    if (typeof studioCost === "number" && studioCost >= 0) {
      const { data: existing } = await supabaseServer
        .from("comp_finances")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabaseServer
          .from("comp_finances")
          .update({ studio_cost: studioCost, updated_at: now })
          .eq("event_id", eventId);
        if (error) {
          console.error("comp-finances PATCH update:", error);
          return NextResponse.json(
            { error: "Failed to update comp finances" },
            { status: 500 }
          );
        }
      } else {
        const { error } = await supabaseServer
          .from("comp_finances")
          .insert({
            event_id: eventId,
            studio_cost: studioCost,
            updated_at: now,
          });
        if (error) {
          console.error("comp-finances PATCH insert:", error);
          return NextResponse.json(
            { error: "Failed to create comp finances" },
            { status: 500 }
          );
        }
      }
    }

    if (Array.isArray(judgesInput)) {
      const { error: deleteErr } = await supabaseServer
        .from("comp_judge_payouts")
        .delete()
        .eq("event_id", eventId);
      if (deleteErr) {
        console.error("comp-finances PATCH delete judges:", deleteErr);
        return NextResponse.json(
          { error: "Failed to update judge payouts" },
          { status: 500 }
        );
      }
      if (judgesInput.length > 0) {
        const rows = judgesInput.map(
          (j: { judge_name?: string; amount_paid?: number }) => ({
            event_id: eventId,
            judge_name: typeof j.judge_name === "string" ? j.judge_name.trim() : "",
            amount_paid: typeof j.amount_paid === "number" && j.amount_paid >= 0 ? j.amount_paid : 0,
            updated_at: now,
          })
        );
        const { error: insertErr } = await supabaseServer
          .from("comp_judge_payouts")
          .insert(rows);
        if (insertErr) {
          console.error("comp-finances PATCH insert judges:", insertErr);
          return NextResponse.json(
            { error: "Failed to save judge payouts" },
            { status: 500 }
          );
        }
      }
    }

    const [financesRes, judgesRes] = await Promise.all([
      supabaseServer
        .from("comp_finances")
        .select("studio_cost")
        .eq("event_id", eventId)
        .maybeSingle(),
      supabaseServer
        .from("comp_judge_payouts")
        .select("id, judge_name, amount_paid, paid, paid_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
    ]);

    const studio_cost = financesRes.data
      ? Number(financesRes.data.studio_cost)
      : 0;
    const judges = (judgesRes.data || []).map((j) => ({
      id: j.id,
      judge_name: j.judge_name ?? "",
      amount_paid: Number(j.amount_paid) || 0,
      paid: !!j.paid,
      paid_at: j.paid_at ?? null,
    }));

    return NextResponse.json({
      data: { studio_cost, judges },
    });
  } catch (e) {
    console.error("comp-finances PATCH:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
