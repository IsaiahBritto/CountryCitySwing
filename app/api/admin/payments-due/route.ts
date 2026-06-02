import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAuth } from "@/lib/financeAuth";
import { fetchPaymentsDue } from "@/lib/financePaymentsDue";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const result = await fetchPaymentsDue();
    return NextResponse.json(result);
  } catch (e) {
    console.error("payments-due GET:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Failed to fetch payments due" },
      { status: 500 }
    );
  }
}
