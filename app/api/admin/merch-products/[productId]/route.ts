import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { datetimeLocalValueToIso } from "@/lib/merchPreorder";

type RouteContext = { params: Promise<{ productId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const { productId } = await context.params;
  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  let body: { preorderEndAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!("preorderEndAt" in body)) {
    return NextResponse.json(
      { error: "preorderEndAt is required (string ISO date or null)" },
      { status: 400 }
    );
  }

  let preorderEndAt: string | null = null;
  if (body.preorderEndAt === null || body.preorderEndAt === "") {
    preorderEndAt = null;
  } else if (typeof body.preorderEndAt === "string") {
    const trimmed = body.preorderEndAt.trim();
    if (!trimmed) {
      preorderEndAt = null;
    } else if (trimmed.includes("T") && !trimmed.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(trimmed)) {
      const fromLocal = datetimeLocalValueToIso(trimmed);
      if (!fromLocal) {
        return NextResponse.json(
          { error: "Invalid preorderEndAt datetime" },
          { status: 400 }
        );
      }
      preorderEndAt = fromLocal;
    } else {
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid preorderEndAt datetime" },
          { status: 400 }
        );
      }
      preorderEndAt = d.toISOString();
    }
  } else {
    return NextResponse.json(
      { error: "preorderEndAt must be a string or null" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("merch_products")
    .update({ preorder_end_at: preorderEndAt })
    .eq("id", productId)
    .select("id,name,type,price,available_sizes,main_image_url,display_order,preorder_end_at,unlimited_inventory")
    .single();

  if (error) {
    console.error("PATCH merch-products:", error);
    return NextResponse.json(
      { error: "Failed to update product", details: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ product: data });
}
