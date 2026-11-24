"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PendingCard = {
  id: string;
  initial_amount: number;
  buyer_email: string;
  buyer_name: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  created_at: string;
};

type GiftCardRow = {
  id: string;
  code: string | null;
  initial_amount: number;
  balance_remaining: number;
  status: string;
  payment_method: string | null;
  paid: boolean;
  buyer_email: string;
  buyer_name: string | null;
  recipient_email: string | null;
  created_at: string;
};

type GiftCardTx = {
  id: string;
  gift_card_id: string;
  type: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
};

export default function AdminGiftCardsPanel() {
  const [pending, setPending] = useState<PendingCard[]>([]);
  const [lookupQ, setLookupQ] = useState("");
  const [cards, setCards] = useState<GiftCardRow[]>([]);
  const [transactions, setTransactions] = useState<GiftCardTx[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token;
  };

  const loadPending = useCallback(async () => {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/gift-cards/pending", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const data = await res.json();
      setPending(data.cards ?? []);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const selectedCard = cards.find((c) => c.id === selectedId) ?? cards[0] ?? null;

  useEffect(() => {
    if (!selectedCard) {
      setRefundAmount("");
      return;
    }
    const bal = Math.floor(Number(selectedCard.balance_remaining) || 0);
    setRefundAmount(bal > 0 ? String(bal) : "");
  }, [selectedId, cards]);

  const runLookup = async () => {
    setError(null);
    setMessage(null);
    const t = await token();
    if (!t || !lookupQ.trim()) return;
    const res = await fetch(
      `/api/admin/gift-cards/lookup?q=${encodeURIComponent(lookupQ)}`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    if (!res.ok) {
      setCards([]);
      setTransactions([]);
      setError("Lookup failed.");
      return;
    }
    const data = await res.json();
    const list = (data.cards ?? []) as GiftCardRow[];
    setCards(list);
    setTransactions((data.transactions ?? []) as GiftCardTx[]);
    setSelectedId(list[0]?.id ?? null);
    setRefundAmount("");
    if (list.length === 0) {
      setError("No gift cards found.");
    }
  };

  const confirmCash = async (id: string) => {
    setLoading(true);
    setError(null);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/admin/gift-cards/${id}/confirm-cash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not confirm cash payment.");
    } else {
      setMessage("Cash payment confirmed and gift card issued.");
    }
    await loadPending();
    setLoading(false);
  };

  const submitRefund = async () => {
    if (!selectedCard) return;
    setError(null);
    setMessage(null);
    const amount = parseInt(refundAmount, 10);
    const balance = Math.floor(Number(selectedCard.balance_remaining) || 0);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Enter a whole-dollar refund amount.");
      return;
    }
    if (amount > balance) {
      setError(`Refund cannot exceed remaining balance ($${balance}).`);
      return;
    }
    if (
      !window.confirm(
        `Refund $${amount} to original ${selectedCard.payment_method === "stripe" ? "Stripe" : "cash"} payment?`
      )
    ) {
      return;
    }

    setLoading(true);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/admin/gift-cards/${selectedCard.id}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        note: refundNote.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Refund failed.");
    } else {
      setMessage(
        `Refunded $${data.amountRefunded}. Balance now $${Number(data.balanceAfter).toFixed(0)}.`
      );
      await runLookup();
    }
    setLoading(false);
  };

  const canRefund =
    selectedCard &&
    selectedCard.paid &&
    selectedCard.status !== "void" &&
    selectedCard.status !== "pending_payment" &&
    (Number(selectedCard.balance_remaining) || 0) > 0;

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-6">
        <h3 className="text-xl font-semibold text-yellow-400">Pending cash purchases</h3>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">None pending.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pending.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-700 bg-neutral-900/60 p-3 text-sm"
              >
                <span className="text-gray-200">
                  ${Number(c.initial_amount).toFixed(0)} — {c.buyer_email}
                  {c.recipient_email && c.recipient_email !== c.buyer_email
                    ? ` → ${c.recipient_email}`
                    : ""}
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void confirmCash(c.id)}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                >
                  Confirm cash paid
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-6">
        <h3 className="text-xl font-semibold text-yellow-400">Lookup &amp; refund</h3>
        <p className="mt-1 text-sm text-gray-400">
          Refunds return to the original payment method (Stripe or cash) for up
          to the remaining gift card balance. The balance is reduced by the
          refund amount, or set to $0 when fully refunded.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            placeholder="Code, email, or card id"
            value={lookupQ}
            onChange={(e) => setLookupQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runLookup();
            }}
          />
          <button
            type="button"
            onClick={() => void runLookup()}
            className="rounded-md border border-yellow-400/50 bg-neutral-900 px-4 py-2 text-sm font-semibold text-yellow-400 hover:bg-yellow-400/10"
          >
            Search
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}
        {message && (
          <p className="mt-3 text-sm text-green-400">{message}</p>
        )}

        {cards.length > 0 && (
          <div className="mt-6 space-y-4">
            {cards.length > 1 && (
              <label className="block text-sm text-gray-300">
                Result
                <select
                  className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm"
                  value={selectedId ?? cards[0].id}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setRefundAmount("");
                  }}
                >
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ?? c.id.slice(0, 8)} — ${Number(c.balance_remaining).toFixed(0)}{" "}
                      left
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedCard && (
              <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 text-sm">
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-500">Code</dt>
                    <dd className="font-mono text-gray-100">{selectedCard.code ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Status</dt>
                    <dd className="capitalize text-gray-100">{selectedCard.status}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Initial / balance</dt>
                    <dd className="text-gray-100">
                      ${Number(selectedCard.initial_amount).toFixed(0)} / $
                      {Number(selectedCard.balance_remaining).toFixed(0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Paid via</dt>
                    <dd className="capitalize text-gray-100">
                      {selectedCard.payment_method ?? "—"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Buyer</dt>
                    <dd className="text-gray-100">
                      {selectedCard.buyer_name ? `${selectedCard.buyer_name} — ` : ""}
                      {selectedCard.buyer_email}
                    </dd>
                  </div>
                </dl>

                {canRefund ? (
                  <div className="mt-4 border-t border-neutral-700 pt-4">
                    <h4 className="text-sm font-semibold text-white">
                      Refund to original payment
                    </h4>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="flex-1 text-sm text-gray-300">
                        Amount (whole dollars)
                        <input
                          type="number"
                          min={1}
                          max={Math.floor(Number(selectedCard.balance_remaining) || 0)}
                          step={1}
                          value={refundAmount}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) setRefundAmount(v);
                          }}
                          className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void submitRefund()}
                        className="btn-signup whitespace-nowrap px-4 py-2 text-sm disabled:opacity-50"
                      >
                        {loading ? "Processing…" : "Refund balance"}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Optional note"
                      value={refundNote}
                      onChange={(e) => setRefundNote(e.target.value)}
                      className="mt-2 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white"
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">
                    No refundable balance on this card.
                  </p>
                )}
              </div>
            )}

            {transactions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-300">Ledger</h4>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-gray-400">
                  {transactions
                    .filter(
                      (tx) =>
                        !selectedCard?.id || tx.gift_card_id === selectedCard.id
                    )
                    .slice(0, 30)
                    .map((tx) => (
                      <li
                        key={tx.id}
                        className="rounded border border-neutral-800 bg-neutral-950/50 px-2 py-1"
                      >
                        {new Date(tx.created_at).toLocaleString()} — {tx.type}{" "}
                        {Number(tx.amount) >= 0 ? "+" : ""}
                        ${Number(tx.amount).toFixed(0)} → balance $
                        {Number(tx.balance_after).toFixed(0)}
                        {tx.note ? ` (${tx.note})` : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}