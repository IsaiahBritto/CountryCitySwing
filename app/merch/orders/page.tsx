"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ShoppingBagIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";

interface OrderItem {
  productName: string;
  size: string;
  quantity: number;
  price: number;
}

interface MerchOrder {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  delivery_method: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: string;
  paid: boolean;
  payment_method: string;
  created_at?: string;
}

export default function MerchOrdersPage() {
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    async function loadOrders() {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session?.user) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/merch-order/my-orders", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.status === 401) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const data = await res.json();
        setOrders(data.orders ?? []);
      } catch (err) {
        console.error("Error loading orders:", err);
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pending",
      processing: "Processing",
      shipped: "Shipped",
      completed: "Completed",
      cancelled: "Cancelled",
    };
    return labels[status] ?? status;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/50";
      case "shipped":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "processing":
        return "bg-amber-500/20 text-amber-400 border-amber-500/50";
      case "cancelled":
        return "bg-neutral-600/30 text-neutral-400 border-neutral-500/50";
      default:
        return "bg-neutral-600/30 text-neutral-300 border-neutral-500/50";
    }
  };

  if (loading) {
    return (
      <section className="max-w-4xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/merch"
            className="text-primary hover:text-yellow-300 transition-colors flex items-center gap-1 text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to Merch
          </Link>
        </div>
        <h1 className="gold-wave text-3xl font-extrabold pb-2 mb-6">
          My Orders
        </h1>
        <div className="flex justify-center py-16">
          <div className="animate-pulse text-gray-400">Loading your orders…</div>
        </div>
      </section>
    );
  }

  if (unauthorized) {
    return (
      <section className="max-w-4xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/merch"
            className="text-primary hover:text-yellow-300 transition-colors flex items-center gap-1 text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to Merch
          </Link>
        </div>
        <h1 className="gold-wave text-3xl font-extrabold pb-2 mb-6">
          My Orders
        </h1>
        <p className="text-gray-400">
          Please sign in to view your orders.{" "}
          <Link href="/auth" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/merch"
          className="text-primary hover:text-yellow-300 transition-colors flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to Merch
        </Link>
      </div>

      <h1 className="gold-wave text-3xl font-extrabold pb-2 mb-6">
        My Orders
      </h1>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-linear-to-b from-amber-950/20 to-neutral-900/50 p-8 md:p-12 text-center shadow-[0_0_30px_rgba(242,201,76,0.08)]">
          <ShoppingBagIcon className="w-16 h-16 mx-auto text-amber-500/60 mb-4" />
          <h2 className="text-xl font-semibold text-amber-200 mb-2">
            No orders yet
          </h2>
          <p className="text-gray-400 max-w-md mx-auto mb-6">
            You don&apos;t have any orders to display at this time. No worries —
            pick something from the merch page and place an order; it&apos;ll show
            up here faster than you can say &ldquo;swing out&rdquo;!
          </p>
          <Link
            href="/merch"
            className="btn-signup inline-flex items-center gap-2 px-5 py-2.5 rounded-md"
          >
            <ShoppingBagIcon className="w-5 h-5" />
            Browse merch
          </Link>
        </div>
      ) : (
        <ul className="space-y-6">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-xl border border-neutral-700 bg-neutral-800/80 overflow-hidden shadow-lg hover:shadow-[0_0_20px_rgba(242,201,76,0.12)] transition-shadow"
            >
              <div className="p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      {formatDate(order.created_at)}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Order #{order.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(
                        order.status
                      )}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        order.paid
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                          : "bg-amber-500/20 text-amber-400 border-amber-500/50"
                      }`}
                    >
                      {order.paid ? "Paid" : "Payment pending"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-neutral-700 pt-4 mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    What you ordered
                  </p>
                  <ul className="space-y-1.5">
                    {(order.items ?? []).map((item: OrderItem, i: number) => (
                      <li
                        key={i}
                        className="text-gray-300 text-sm flex justify-between gap-2"
                      >
                        <span>
                          {item.productName}
                          {item.size ? ` (${item.size})` : ""} × {item.quantity}
                        </span>
                        <span className="text-primary font-medium shrink-0">
                          $
                          {((item.price ?? 0) * (item.quantity ?? 1)).toFixed(
                            2
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-neutral-700">
                  <p className="text-gray-500 text-sm capitalize">
                    {order.delivery_method === "ship"
                      ? "Shipping"
                      : "Local pickup"}
                  </p>
                  <p className="text-primary font-bold">
                    Total ${Number(order.total).toFixed(2)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
