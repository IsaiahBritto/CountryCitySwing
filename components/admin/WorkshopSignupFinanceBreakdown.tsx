"use client";

import { useState } from "react";
import {
  bucketLabel,
  totalsMatchMetrics,
  type WorkshopSignupBreakdownRow,
  type WorkshopSignupBucketTotals,
} from "@/lib/financeSignupBreakdown";

function formatMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function promoDisplay(label: WorkshopSignupBreakdownRow["promoLabel"]): string {
  if (label === "free") return "Free promo";
  if (label === "used") return "Promo used";
  return "—";
}

export default function WorkshopSignupFinanceBreakdown({
  rows,
  totals,
  loading,
  error,
  metrics,
  hasMetrics,
}: {
  rows: WorkshopSignupBreakdownRow[];
  totals: WorkshopSignupBucketTotals;
  loading: boolean;
  error: string | null;
  metrics: {
    cash_total: number;
    stripe_total: number;
    other_total: number;
    ccs_team_cash_total: number;
    ccs_team_stripe_total: number;
    stripe_taxes_fees_total: number;
  } | null;
  hasMetrics: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const matches =
    metrics != null && totalsMatchMetrics(totals, metrics);

  return (
    <div className="mt-6 rounded-xl border border-neutral-700 bg-neutral-800/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-neutral-800/50 sm:px-5"
      >
        <div className="min-w-0">
          <p className="font-medium text-white">
            Registration breakdown ({rows.length} signup{rows.length === 1 ? "" : "s"})
          </p>
          {!expanded && !loading && !error && rows.length > 0 && (
            <p className="mt-1 text-xs text-neutral-400 sm:text-sm">
              Cash {formatMoney(totals.cash)} · Stripe {formatMoney(totals.stripe)}
              {totals.other > 0 ? ` · Other ${formatMoney(totals.other)}` : ""}
              {totals.ccsTeamTotal > 0
                ? ` · CCS Team ${formatMoney(totals.ccsTeamTotal)}`
                : ""}
              {totals.totalCouponDiscount > 0
                ? ` · Coupon discount ${formatMoney(totals.totalCouponDiscount)}`
                : ""}
            </p>
          )}
        </div>
        <span className="shrink-0 text-neutral-500">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="border-t border-neutral-700 px-4 pb-4 pt-3 sm:px-5">
          {loading ? (
            <p className="text-sm text-neutral-400">Loading registrations…</p>
          ) : error ? (
            <p className="text-sm text-primary">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-neutral-400">No registrations for this event.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-neutral-500">
                Net = ticket principal after partial refunds. Stripe tax and processing fees
                are shown separately and match &quot;Taxes/Fees collected via Stripe.&quot;
              </p>
              <div className="overflow-x-auto rounded-lg border border-neutral-700">
                <table className="min-w-[720px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-700 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Pay method</th>
                      <th className="px-3 py-2 font-medium text-right">List price</th>
                      <th className="px-3 py-2 font-medium text-right">Collected</th>
                      <th className="px-3 py-2 font-medium text-right">Refunded</th>
                      <th className="px-3 py-2 font-medium text-right">Net</th>
                      <th className="px-3 py-2 font-medium text-right">Discount</th>
                      <th className="px-3 py-2 font-medium text-right">Stripe tax+fee</th>
                      <th className="px-3 py-2 font-medium">Promo</th>
                      <th className="px-3 py-2 font-medium">In</th>
                      <th className="px-3 py-2 font-medium">Bucket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {rows.map((row) => (
                      <tr key={row.id} className="text-neutral-300">
                        <td className="px-3 py-2 font-medium text-white">{row.name}</td>
                        <td className="px-3 py-2">{row.paymentMethod}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.listPriceAtSignup)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.collected)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                          {row.refunded > 0 ? formatMoney(row.refunded) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-white">
                          {row.countsTowardTotals ? formatMoney(row.netRevenue) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-400/90">
                          {row.couponDiscount > 0 ? formatMoney(row.couponDiscount) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                          {row.bucket === "stripe" || row.bucket === "ccs_team_stripe"
                            ? formatMoney(row.stripeTax + row.stripeFee)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">{promoDisplay(row.promoLabel)}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.checkedIn ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2 text-xs">{bucketLabel(row.bucket)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-neutral-600 bg-neutral-900/40 font-medium text-white">
                      <td className="px-3 py-2" colSpan={5}>
                        Breakdown subtotals (net)
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(totals.grossTotal)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-400/90">
                        {totals.totalCouponDiscount > 0
                          ? formatMoney(totals.totalCouponDiscount)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(totals.stripeTaxesFees)}
                      </td>
                      <td className="px-3 py-2" colSpan={3} />
                    </tr>
                    <tr className="bg-neutral-900/20 text-xs text-neutral-400">
                      <td className="px-3 py-2" colSpan={11}>
                        Cash {formatMoney(totals.cash)} · Stripe {formatMoney(totals.stripe)}
                        {totals.other > 0 ? ` · Other ${formatMoney(totals.other)}` : ""}
                        {totals.ccsTeamCash > 0
                          ? ` · CCS Team cash ${formatMoney(totals.ccsTeamCash)}`
                          : ""}
                        {totals.ccsTeamStripe > 0
                          ? ` · CCS Team Stripe ${formatMoney(totals.ccsTeamStripe)}`
                          : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {hasMetrics && metrics && (
                <p
                  className={`mt-3 text-sm ${
                    matches ? "text-green-400" : "text-amber-400/90"
                  }`}
                >
                  {matches
                    ? "Matches refreshed finance numbers."
                    : "Totals differ from saved finance numbers — click Refresh finance numbers to sync, or finance totals may have been manually adjusted."}
                </p>
              )}
              {!hasMetrics && (
                <p className="mt-3 text-sm text-neutral-400">
                  Refresh finance numbers to compare breakdown subtotals with saved metrics.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
