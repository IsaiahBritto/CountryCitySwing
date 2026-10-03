"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import {
  aggregateByProductAndSize,
  computeBaseMerchOrderPlan,
  computeSizeSharesForProductRows,
  sortSizes,
  type MerchOrderForStats,
} from "@/lib/merchAdminAggregates";
import {
  BASE_CCS_MERCH_PRODUCT_NAMES,
  baseCcsMerchProductNameSet,
} from "@/lib/merchBaseProductNames";

const TARGET_MAX = 200;

type CatalogProduct = {
  id: string;
  name: string;
  availableSizes: string[];
};

type BaseMerchSizePlannerProps = {
  orders: MerchOrderForStats[];
  products: CatalogProduct[];
  onHandByKey: Map<string, number>;
  targetTotal: number;
  onTargetTotalChange: (value: number) => void;
};

function clampTarget(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(TARGET_MAX, Math.max(0, Math.floor(n)));
}

function orderMapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if ((b.get(k) ?? 0) !== v) return false;
  }
  return true;
}

function OrderQtyStepper({
  value,
  onChange,
  compact,
}: {
  value: number;
  onChange: (next: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center justify-end gap-0.5 ${
        compact ? "min-w-[6.5rem]" : "min-w-[7.5rem]"
      }`}
    >
      <button
        type="button"
        aria-label="Decrease order quantity"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="p-1 rounded-md border border-neutral-600 bg-neutral-700 text-gray-200 hover:bg-neutral-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <MinusIcon className="w-4 h-4" aria-hidden />
      </button>
      <span className="min-w-[2ch] text-center tabular-nums font-semibold text-primary px-1">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase order quantity"
        onClick={() => onChange(value + 1)}
        className="p-1 rounded-md border border-neutral-600 bg-neutral-700 text-gray-200 hover:bg-neutral-600 hover:text-white transition-colors"
      >
        <PlusIcon className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

export default function BaseMerchSizePlanner({
  orders,
  products,
  onHandByKey,
  targetTotal,
  onTargetTotalChange,
}: BaseMerchSizePlannerProps) {
  const baseNameSet = useMemo(() => baseCcsMerchProductNameSet(), []);

  const sizesByName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of products) {
      if (baseNameSet.has(p.name)) {
        map.set(p.name, p.availableSizes);
      }
    }
    return map;
  }, [products, baseNameSet]);

  const { byProduct, grandTotal } = useMemo(
    () => aggregateByProductAndSize(orders, baseNameSet),
    [orders, baseNameSet]
  );

  const shares = useMemo(
    () =>
      computeSizeSharesForProductRows(
        BASE_CCS_MERCH_PRODUCT_NAMES,
        byProduct,
        sizesByName,
        grandTotal
      ),
    [byProduct, grandTotal, sizesByName]
  );

  const plan = useMemo(
    () =>
      computeBaseMerchOrderPlan({
        shares,
        onHandByKey,
        orderBudget: targetTotal,
      }),
    [shares, onHandByKey, targetTotal]
  );

  const shareByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shares) m.set(s.key, s.share);
    return m;
  }, [shares]);

  const showPlan = targetTotal > 0 && grandTotal > 0;
  const [referenceColumnsOpen, setReferenceColumnsOpen] = useState(true);
  const [orderByKey, setOrderByKey] = useState<Map<string, number>>(
    () => new Map(plan.orderByKey)
  );

  useEffect(() => {
    setOrderByKey(new Map(plan.orderByKey));
  }, [plan]);

  const hasManualOrderEdits = useMemo(
    () => !orderMapsEqual(orderByKey, plan.orderByKey),
    [orderByKey, plan.orderByKey]
  );

  const effectiveOrderTotal = useMemo(() => {
    let sum = 0;
    for (const v of orderByKey.values()) sum += v;
    return sum;
  }, [orderByKey]);

  const setOrderQty = (key: string, qty: number) => {
    setOrderByKey((prev) => {
      const next = new Map(prev);
      next.set(key, Math.max(0, Math.floor(qty)));
      return next;
    });
  };

  const resetOrderQtyToSuggested = () => {
    setOrderByKey(new Map(plan.orderByKey));
  };

  const orderPlainText = useMemo(() => {
    if (!showPlan) return "";

    const blocks: string[] = [];
    for (const productName of BASE_CCS_MERCH_PRODUCT_NAMES) {
      const preferred = sizesByName.get(productName);
      const bySize = byProduct[productName] ?? {};
      const sizes = sortSizes(
        [...(preferred ?? []), ...Object.keys(bySize)],
        preferred
      );
      const lines: string[] = [];
      for (const size of sizes) {
        const qty = orderByKey.get(`${productName}\0${size}`) ?? 0;
        if (qty > 0) lines.push(`     - ${size}: ${qty}`);
      }
      if (lines.length > 0) {
        blocks.push(`${productName}:\n${lines.join("\n")}`);
      }
    }
    return blocks.join("\n\n");
  }, [showPlan, sizesByName, byProduct, orderByKey]);

  return (
    <div className="bg-neutral-800 rounded-lg p-6 mb-6">
      <h3 className="text-2xl font-semibold text-white mb-1">
        Base merch size order planner
      </h3>
      <p className="text-sm text-gray-400 mb-6">
        Ideal in-hand mix from paid, non-cancelled orders for{" "}
        {BASE_CCS_MERCH_PRODUCT_NAMES.join(", ")}. Uses inventory from the
        section above; sizes already at or above the historical mix get order
        qty 0.
      </p>

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-gray-300 shrink-0">
            Total units to order (this batch)
          </label>
          <input
            type="range"
            min={0}
            max={TARGET_MAX}
            step={1}
            value={targetTotal}
            onChange={(e) =>
              onTargetTotalChange(clampTarget(Number(e.target.value)))
            }
            className="flex-1 min-w-[8rem] h-2 accent-primary cursor-pointer"
          />
          <input
            type="number"
            min={0}
            max={TARGET_MAX}
            value={targetTotal}
            onChange={(e) =>
              onTargetTotalChange(clampTarget(Number(e.target.value)))
            }
            onBlur={(e) =>
              onTargetTotalChange(clampTarget(Number(e.target.value)))
            }
            className="w-24 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {grandTotal === 0 ? (
        <p className="text-sm text-gray-400">
          No eligible order history for base merch yet. Planners need at least
          one paid, non-cancelled line item for the three products above.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-300">
            <span>
              Historical units analyzed:{" "}
              <strong className="text-white">{grandTotal}</strong>
            </span>
            <span>
              On hand total:{" "}
              <strong className="text-white">{plan.onHandTotal}</strong>
            </span>
            {showPlan && (
              <>
                <span>
                  Target in-hand after order:{" "}
                  <strong className="text-white">
                    {plan.targetInHandTotal}
                  </strong>
                </span>
                <span>
                  Order total:{" "}
                  <strong className="text-primary">{effectiveOrderTotal}</strong>
                  {hasManualOrderEdits && (
                    <span className="text-amber-400/90 text-xs ml-1">
                      (edited)
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          {showPlan && hasManualOrderEdits && (
            <button
              type="button"
              onClick={resetOrderQtyToSuggested}
              className="mb-4 text-sm text-primary hover:text-white underline-offset-2 hover:underline"
            >
              Reset order quantities to suggested mix
            </button>
          )}

          {targetTotal === 0 && (
            <p className="text-sm text-gray-500 mb-4">
              Enter a batch quantity above to see ideal in-hand targets and order
              counts.
            </p>
          )}

          <button
            type="button"
            onClick={() => setReferenceColumnsOpen((v) => !v)}
            className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            aria-expanded={referenceColumnsOpen}
          >
            {referenceColumnsOpen ? (
              <ChevronDownIcon className="w-4 h-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRightIcon className="w-4 h-4 shrink-0" aria-hidden />
            )}
            {referenceColumnsOpen
              ? "Hide on hand, historical, share & ideal columns"
              : "Show on hand, historical, share & ideal columns"}
          </button>

          <div className="space-y-6">
            {BASE_CCS_MERCH_PRODUCT_NAMES.map((productName) => {
              const bySize = byProduct[productName] ?? {};
              const preferred = sizesByName.get(productName);
              const allSizes = sortSizes(
                [...(preferred ?? []), ...Object.keys(bySize)],
                preferred
              );
              const displaySizes =
                !referenceColumnsOpen && showPlan
                  ? allSizes.filter(
                      (size) =>
                        (orderByKey.get(`${productName}\0${size}`) ?? 0) > 0
                    )
                  : allSizes;
              const historicalProductTotal = Object.values(bySize).reduce(
                (a, b) => a + b,
                0
              );
              let onHandProductTotal = 0;
              let idealProductTotal = 0;
              let orderProductTotal = 0;
              for (const size of allSizes) {
                const key = `${productName}\0${size}`;
                onHandProductTotal += onHandByKey.get(key) ?? 0;
                idealProductTotal += plan.idealByKey.get(key) ?? 0;
                orderProductTotal += orderByKey.get(key) ?? 0;
              }

              if (
                !referenceColumnsOpen &&
                showPlan &&
                orderProductTotal === 0
              ) {
                return null;
              }

              return (
                <div
                  key={productName}
                  className="rounded-lg border border-neutral-700 overflow-hidden"
                >
                  <div className="bg-neutral-700/60 px-4 py-2">
                    <h4 className="text-lg font-semibold text-primary">
                      {productName}
                    </h4>
                  </div>
                  <div
                    className={`overflow-x-auto px-4 pb-4 pt-1 ${
                      !referenceColumnsOpen ? "flex justify-start" : ""
                    }`}
                  >
                    <table
                      className={`text-sm text-left border-collapse ${
                        referenceColumnsOpen
                          ? "w-full min-w-[36rem]"
                          : "w-auto table-fixed"
                      }`}
                    >
                      {!referenceColumnsOpen && showPlan && (
                        <colgroup>
                          <col className="w-[4.5rem]" />
                          <col className="w-[8.5rem]" />
                        </colgroup>
                      )}
                      <thead>
                        <tr className="border-b-2 border-neutral-600 text-gray-400 bg-neutral-800/80">
                          <th className="px-3 py-2.5 font-medium text-left">
                            Size
                          </th>
                          {referenceColumnsOpen && (
                            <>
                              <th className="px-3 py-2.5 font-medium text-right">
                                On hand
                              </th>
                              <th className="px-3 py-2.5 font-medium text-right">
                                Historical
                              </th>
                              <th className="px-3 py-2.5 font-medium text-right">
                                Share
                              </th>
                              {showPlan && (
                                <>
                                  <th className="px-3 py-2.5 font-medium text-right">
                                    Ideal in-hand
                                  </th>
                                  <th className="px-3 py-2.5 font-medium text-right">
                                    After order
                                  </th>
                                </>
                              )}
                            </>
                          )}
                          {showPlan && (
                            <th
                              className={`px-3 py-2.5 font-medium text-right ${
                                referenceColumnsOpen ? "" : "pl-6"
                              }`}
                            >
                              Order qty
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {displaySizes.map((size, rowIndex) => {
                          const historical = bySize[size] ?? 0;
                          const key = `${productName}\0${size}`;
                          const share = shareByKey.get(key) ?? 0;
                          const onHand = onHandByKey.get(key) ?? 0;
                          const ideal = plan.idealByKey.get(key) ?? 0;
                          const orderQty = orderByKey.get(key) ?? 0;
                          const afterOrder = onHand + orderQty;
                          const stripe =
                            rowIndex % 2 === 0
                              ? "bg-neutral-800/35"
                              : "bg-neutral-900/55";
                          return (
                            <tr
                              key={size}
                              className={`border-b border-neutral-600/80 text-white ${stripe} hover:bg-neutral-700/45 transition-colors`}
                            >
                              <td className="px-3 py-2.5 font-medium">
                                {size}
                              </td>
                              {referenceColumnsOpen && (
                                <>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {onHand}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {historical}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    <span>{share.toFixed(4)}</span>
                                    <span className="text-gray-500 text-xs ml-1">
                                      ({(share * 100).toFixed(1)}%)
                                    </span>
                                  </td>
                                  {showPlan && (
                                    <>
                                      <td className="px-3 py-2.5 text-right tabular-nums">
                                        {ideal}
                                      </td>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">
                                        {afterOrder}
                                      </td>
                                    </>
                                  )}
                                </>
                              )}
                              {showPlan && (
                                <td
                                  className={`px-3 py-2.5 text-right ${
                                    referenceColumnsOpen ? "" : "pl-2"
                                  }`}
                                >
                                  <OrderQtyStepper
                                    value={orderQty}
                                    onChange={(n) => setOrderQty(key, n)}
                                    compact={!referenceColumnsOpen}
                                  />
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-neutral-500 bg-neutral-900/70 text-gray-200 font-semibold">
                          <td className="px-3 py-2.5">Subtotal</td>
                          {referenceColumnsOpen && (
                            <>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {onHandProductTotal}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {historicalProductTotal}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {grandTotal > 0
                                  ? (
                                      historicalProductTotal / grandTotal
                                    ).toFixed(4)
                                  : "—"}
                              </td>
                              {showPlan && (
                                <>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {idealProductTotal}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {onHandProductTotal + orderProductTotal}
                                  </td>
                                </>
                              )}
                            </>
                          )}
                          {showPlan && (
                            <td
                              className={`px-3 py-2.5 text-right tabular-nums text-primary ${
                                referenceColumnsOpen ? "" : "pl-6"
                              }`}
                            >
                              {orderProductTotal}
                            </td>
                          )}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {showPlan && (
            <>
              <p className="mt-4 text-sm text-gray-400">
                All products combined — units to order:{" "}
                <strong className="text-white">{effectiveOrderTotal}</strong>
                {effectiveOrderTotal === targetTotal ? (
                  <span className="text-green-400/90">
                    {" "}
                    (matches batch target)
                  </span>
                ) : (
                  <span className="text-amber-400/90">
                    {" "}
                    (batch target {targetTotal}
                    {hasManualOrderEdits ? ", manually adjusted" : ""})
                  </span>
                )}
              </p>

              <div className="mt-4 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                  Order summary (plain text)
                </p>
                {orderPlainText ? (
                  <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {orderPlainText}
                  </pre>
                ) : (
                  <p className="text-sm text-gray-500">No units to order.</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
