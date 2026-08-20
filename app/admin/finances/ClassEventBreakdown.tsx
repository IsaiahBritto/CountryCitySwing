"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeClassEventFinances,
  validateClassPayoutTotal,
} from "@/lib/utils/classEventFinances";

export interface ClassFinanceBase {
  id: string;
  event_id: string;
  venue_cost: number;
  cash_override: number | null;
  stripe_override: number | null;
  updated_at: string;
}

export interface ClassFinancePayout {
  id: string;
  event_id: string;
  team_slot_id: string | null;
  role_label: string;
  payee_name: string;
  amount: number;
  paid_at: string | null;
  sort_order: number;
}

export function ClassEventBreakdown({
  eventTitle,
  effectiveCash,
  effectiveStripe,
  base,
  payouts,
  loading,
  error,
  saving,
  onPatchBase,
  onPatchPayout,
  onAddPayout,
  onDeletePayout,
}: {
  eventTitle: string;
  effectiveCash: number;
  effectiveStripe: number;
  base: ClassFinanceBase | null;
  payouts: ClassFinancePayout[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  onPatchBase: (u: {
    venue_cost?: number;
    cash_override?: number | null;
    stripe_override?: number | null;
  }) => Promise<void>;
  onPatchPayout: (payoutId: string, u: {
    role_label?: string;
    payee_name?: string;
    amount?: number;
    mark_paid?: boolean;
  }) => Promise<void>;
  onAddPayout: (u: { role_label?: string; payee_name: string; amount?: number }) => Promise<void>;
  onDeletePayout: (payoutId: string) => Promise<void>;
}) {
  const venueCost = base?.venue_cost ?? 0;
  const payoutAmounts = payouts.map((p) => Number(p.amount) || 0);

  const finances = useMemo(
    () =>
      computeClassEventFinances({
        cashTotal: effectiveCash,
        stripeTotal: effectiveStripe,
        venueCost,
        payoutAmounts,
      }),
    [effectiveCash, effectiveStripe, venueCost, payoutAmounts]
  );

  const allocations = useMemo(() => {
    const items = [{ label: "Studio cost (venue)", value: venueCost }];
    for (const p of payouts) {
      const amt = Number(p.amount) || 0;
      if (amt > 0 || p.payee_name.trim()) {
        const role = p.role_label.trim();
        items.push({
          label: role ? `${role} payout` : `${p.payee_name} payout`,
          value: amt,
        });
      }
    }
    items.push(
      { label: "Cash → Isaiah", value: finances.isaiahPayout },
      { label: "Electronic → CCS", value: finances.ccsElectronic }
    );
    return items;
  }, [venueCost, payouts, finances.isaiahPayout, finances.ccsElectronic]);

  const [venueInput, setVenueInput] = useState(String(venueCost));
  const [payoutInputs, setPayoutInputs] = useState<Record<string, string>>({});
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [roleInputs, setRoleInputs] = useState<Record<string, string>>({});
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [newPayeeName, setNewPayeeName] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");

  useEffect(() => {
    setVenueInput(String(venueCost));
  }, [venueCost]);

  useEffect(() => {
    const amounts: Record<string, string> = {};
    const names: Record<string, string> = {};
    const roles: Record<string, string> = {};
    for (const p of payouts) {
      amounts[p.id] = String(Number(p.amount) || 0);
      names[p.id] = p.payee_name;
      roles[p.id] = p.role_label;
    }
    setPayoutInputs(amounts);
    setNameInputs(names);
    setRoleInputs(roles);
    setPayoutError(null);
  }, [payouts]);

  const saveVenueCost = () => {
    const v = parseFloat(venueInput);
    if (!Number.isNaN(v) && v >= 0) onPatchBase({ venue_cost: v });
  };

  const savePayoutAmount = (payoutId: string) => {
    const v = parseFloat(payoutInputs[payoutId] ?? "0");
    if (Number.isNaN(v) || v < 0) return;
    const nextTotal = payouts.reduce((sum, p) => {
      if (p.id === payoutId) return sum + v;
      return sum + (Number(p.amount) || 0);
    }, 0);
    const msg = validateClassPayoutTotal(nextTotal, effectiveCash);
    setPayoutError(msg);
    if (!msg) onPatchPayout(payoutId, { amount: v });
  };

  const savePayoutName = (payoutId: string) => {
    const name = (nameInputs[payoutId] ?? "").trim();
    if (name) onPatchPayout(payoutId, { payee_name: name });
  };

  const savePayoutRole = (payoutId: string) => {
    onPatchPayout(payoutId, { role_label: (roleInputs[payoutId] ?? "").trim() });
  };

  const handleAddPayout = useCallback(async () => {
    const name = newPayeeName.trim();
    if (!name) return;
    await onAddPayout({
      payee_name: name,
      role_label: newRoleLabel.trim() || undefined,
      amount: 0,
    });
    setNewPayeeName("");
    setNewRoleLabel("");
  }, [newPayeeName, newRoleLabel, onAddPayout]);

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-neutral-700 bg-neutral-800/30 px-4 py-8 text-center text-neutral-400">
        Loading class breakdown…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-lg border border-primary/50 bg-primary/10 px-4 py-4 text-primary">
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-primary/40 bg-neutral-800/30 p-6 ring-1 ring-primary/20">
      <h3 className="mb-4 text-base font-semibold text-primary">
        {eventTitle} — Payout breakdown
      </h3>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-300">Venue cost</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={venueInput}
            onChange={(e) => setVenueInput(e.target.value)}
            onBlur={saveVenueCost}
            disabled={saving}
            className="w-28 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          <span className="text-neutral-500">$</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-300">Total revenue</span>
          <span className="text-lg font-bold text-white">${finances.totalRevenue.toFixed(2)}</span>
          <span className="text-xs text-neutral-500">(Cash + Stripe)</span>
        </div>

        {payoutError && (
          <p className="rounded border border-primary/50 bg-primary/10 px-3 py-2 text-sm text-primary">
            {payoutError}
          </p>
        )}
      </div>

      <div className="mt-6">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Payouts
        </h4>
        {payouts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No payouts yet. Fill team slots on the schedule or add a payout below.
          </p>
        ) : (
          <div className="space-y-3">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900/40 px-3 py-3"
              >
                <input
                  type="text"
                  placeholder="Role"
                  value={roleInputs[p.id] ?? ""}
                  onChange={(e) =>
                    setRoleInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  onBlur={() => savePayoutRole(p.id)}
                  disabled={saving}
                  className="min-w-[120px] flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-neutral-300 focus:border-primary focus:outline-none disabled:opacity-60"
                />
                <input
                  type="text"
                  placeholder="Payee"
                  value={nameInputs[p.id] ?? ""}
                  onChange={(e) =>
                    setNameInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  onBlur={() => savePayoutName(p.id)}
                  disabled={saving}
                  className="min-w-[140px] flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-white focus:border-primary focus:outline-none disabled:opacity-60"
                />
                <div className="flex items-center gap-1">
                  <span className="text-neutral-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={payoutInputs[p.id] ?? "0"}
                    onChange={(e) =>
                      setPayoutInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    onBlur={() => savePayoutAmount(p.id)}
                    disabled={saving}
                    className="w-24 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-white focus:border-primary focus:outline-none disabled:opacity-60"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-sm text-neutral-400">
                  <input
                    type="checkbox"
                    checked={p.paid_at != null}
                    disabled={saving || p.paid_at != null}
                    onChange={() => {
                      if (p.paid_at == null) onPatchPayout(p.id, { mark_paid: true });
                    }}
                    className="rounded border-neutral-600"
                  />
                  Paid
                </label>
                {p.team_slot_id ? (
                  <span className="text-xs text-emerald-500/80">from schedule</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDeletePayout(p.id)}
                    disabled={saving}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-neutral-600 bg-neutral-900/20 p-3">
          <input
            type="text"
            placeholder="Role (optional)"
            value={newRoleLabel}
            onChange={(e) => setNewRoleLabel(e.target.value)}
            className="min-w-[120px] rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none"
          />
          <input
            type="text"
            placeholder="Payee name"
            value={newPayeeName}
            onChange={(e) => setNewPayeeName(e.target.value)}
            className="min-w-[140px] flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddPayout}
            disabled={saving || !newPayeeName.trim()}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Add payout
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Allocation summary
        </h4>
        <ul className="space-y-2 text-sm">
          {allocations.map((a) => (
            <li key={a.label} className="flex items-center justify-between text-neutral-300">
              <span>{a.label}</span>
              <span className="font-medium text-white">${a.value.toFixed(2)}</span>
            </li>
          ))}
          <li className="mt-2 flex items-center justify-between border-t border-neutral-700 pt-2 font-medium text-white">
            <span>Total allocated</span>
            <span>${finances.allocationsTotal.toFixed(2)}</span>
          </li>
          {Math.abs(finances.reconciliationDiff) > 0.01 && (
            <li className="flex items-center justify-between text-primary">
              <span>Reconciliation difference</span>
              <span>${finances.reconciliationDiff.toFixed(2)}</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
