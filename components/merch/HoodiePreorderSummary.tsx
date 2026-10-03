"use client";

import { useMemo } from "react";
import {
  aggregateHoodieByProductAndSize,
  sortSizes,
  type MerchOrderForStats,
} from "@/lib/merchAdminAggregates";

type HoodieProduct = {
  id: string;
  name: string;
  availableSizes: string[];
};

type HoodiePreorderSummaryProps = {
  orders: MerchOrderForStats[];
  hoodieProducts: HoodieProduct[];
};

export default function HoodiePreorderSummary({
  orders,
  hoodieProducts,
}: HoodiePreorderSummaryProps) {
  const productOrder = useMemo(
    () => hoodieProducts.map((p) => p.name),
    [hoodieProducts]
  );

  const sizesByProductName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of hoodieProducts) {
      map.set(p.name, p.availableSizes);
    }
    return map;
  }, [hoodieProducts]);

  const catalog = useMemo(
    () => hoodieProducts.map((p) => ({ id: p.id, name: p.name })),
    [hoodieProducts]
  );

  const { byProduct, grandTotal } = useMemo(
    () => aggregateHoodieByProductAndSize(orders, catalog),
    [orders, catalog]
  );

  const productCount = useMemo(() => {
    return productOrder.filter(
      (n) => Object.values(byProduct[n] ?? {}).reduce((a, b) => a + b, 0) > 0
    ).length;
  }, [byProduct, productOrder]);

  const productsToShow = useMemo(() => {
    const withQty = new Set(Object.keys(byProduct));
    return [
      ...productOrder.filter((n) => withQty.has(n)),
      ...[...withQty].filter((n) => !productOrder.includes(n)).sort(),
    ].filter(
      (n) => Object.values(byProduct[n] ?? {}).reduce((a, b) => a + b, 0) > 0
    );
  }, [byProduct, productOrder]);

  const summaryLabel =
    grandTotal > 0
      ? `Hoodie Preorders (${grandTotal} unit${grandTotal === 1 ? "" : "s"} across ${productCount} product${productCount === 1 ? "" : "s"})`
      : "Hoodie Preorders";

  const preorderPlainText = useMemo(() => {
    if (grandTotal === 0) return "";

    const blocks: string[] = [];
    for (const productName of productsToShow) {
      const bySize = byProduct[productName] ?? {};
      const preferred = sizesByProductName.get(productName);
      const sizes = sortSizes(Object.keys(bySize), preferred);
      const lines: string[] = [];
      for (const size of sizes) {
        const qty = bySize[size] ?? 0;
        if (qty > 0) lines.push(`     - ${size}: ${qty}`);
      }
      if (lines.length > 0) {
        blocks.push(`${productName}:\n${lines.join("\n")}`);
      }
    }
    return blocks.join("\n\n");
  }, [grandTotal, productsToShow, byProduct, sizesByProductName]);

  if (hoodieProducts.length === 0) {
    return null;
  }

  return (
    <details className="mb-6 rounded-lg border border-neutral-600 bg-neutral-700/50 group">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-primary hover:text-white list-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
        <span>{summaryLabel}</span>
        <span className="text-xs font-normal text-gray-400 group-open:hidden">
          Expand
        </span>
      </summary>
      <div className="border-t border-neutral-600 px-4 py-4">
        {grandTotal === 0 ? (
          <p className="text-sm text-gray-400">
            No non-cancelled hoodie preorders yet.
          </p>
        ) : (
          <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {productsToShow.map((productName) => {
              const bySize = byProduct[productName] ?? {};
              const preferred = sizesByProductName.get(productName);
              const sizes = sortSizes(Object.keys(bySize), preferred);
              const productTotal = Object.values(bySize).reduce(
                (a, b) => a + b,
                0
              );
              if (productTotal === 0) return null;

              return (
                <div key={productName}>
                  <p className="text-sm font-medium text-gray-300 mb-1">
                    {productName}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-white">
                    {sizes.map((size) => {
                      const qty = bySize[size] ?? 0;
                      if (qty <= 0) return null;
                      return (
                        <span key={size}>
                          {size}: <strong>{qty}</strong>
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Total: <strong>{productTotal}</strong>
                  </p>
                </div>
              );
            })}
            <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-end">
              <p className="text-sm font-medium text-gray-300">
                Grand total (all hoodies):{" "}
                <span className="text-white font-bold">{grandTotal}</span>
              </p>
              <span className="text-xs text-gray-500 mt-1">
                Non-cancelled orders (includes unpaid)
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-neutral-600 bg-neutral-800/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
              Preorder summary (plain text)
            </p>
            <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
              {preorderPlainText}
            </pre>
          </div>
          </>
        )}
      </div>
    </details>
  );
}
