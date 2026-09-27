import { supabaseServer } from "@/lib/supabaseServer";

export type MerchOrderLineItem = {
  productId: string;
  productName?: string;
  size: string;
  quantity: number;
};

export type MerchProductOrderMeta = {
  id: string;
  name: string;
  preorder_end_at: string | null;
  unlimited_inventory: boolean;
};

export async function loadMerchProductsForOrder(
  items: MerchOrderLineItem[]
): Promise<
  | { ok: true; products: MerchProductOrderMeta[] }
  | { ok: false; error: string; status: number }
> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  if (productIds.length === 0) {
    return { ok: false, error: "No products in order", status: 400 };
  }

  const { data, error } = await supabaseServer
    .from("merch_products")
    .select("id,name,preorder_end_at,unlimited_inventory")
    .in("id", productIds);

  if (error) {
    console.error("loadMerchProductsForOrder:", error);
    return { ok: false, error: "Failed to validate products", status: 500 };
  }

  if (!data || data.length !== productIds.length) {
    return { ok: false, error: "One or more products are invalid", status: 400 };
  }

  const now = Date.now();
  for (const product of data) {
    if (product.preorder_end_at) {
      const endMs = new Date(product.preorder_end_at).getTime();
      if (!Number.isNaN(endMs) && endMs <= now) {
        return {
          ok: false,
          error: `Preorder has ended for ${product.name}`,
          status: 400,
        };
      }
    }
  }

  return { ok: true, products: data };
}

export function merchProductMetaById(
  products: MerchProductOrderMeta[]
): Map<string, MerchProductOrderMeta> {
  return new Map(products.map((p) => [p.id, p]));
}
