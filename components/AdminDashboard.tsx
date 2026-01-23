"use client";

import { useState, useEffect } from "react";
import { ArrowLeftIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface Product {
  id: string;
  name: string;
  type: string;
  price: number;
  availableSizes: string[];
}

interface InventoryItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
}

interface Order {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  delivery_method: string;
  shipping_address: any;
  items: any[];
  subtotal: number;
  shipping: number;
  total: number;
  status: string;
  tracking_number?: string;
  notes?: string;
  created_at: string;
}

interface AdminDashboardProps {
  onBack: () => void;
  products: Product[];
}

export default function AdminDashboard({ onBack, products }: AdminDashboardProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingInventory, setEditingInventory] = useState<{
    [key: string]: number;
  }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [showCompleted]); // products is used inside loadData but doesn't need to trigger reloads

  async function loadData() {
    setLoading(true);
    try {
      // Load inventory
      const { data: invData, error: invError } = await supabaseBrowser
        .from("merch_inventory")
        .select("*")
        .order("product_id")
        .order("size");

      if (invError) {
        console.error("Error loading inventory:", invError);
      } else if (invData) {
        setInventory(invData);
        // Initialize editing state
        const editState: { [key: string]: number } = {};
        invData.forEach((item) => {
          editState[`${item.product_id}-${item.size}`] = item.quantity;
        });
        // Also initialize for sizes that don't have inventory records yet
        products.forEach((product) => {
          product.availableSizes.forEach((size) => {
            const key = `${product.id}-${size}`;
            if (!(key in editState)) {
              editState[key] = 0;
            }
          });
        });
        setEditingInventory(editState);
      }

      // Load orders
      // First check if user is authenticated
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) {
        console.error("User not authenticated");
        setOrders([]);
      } else {
        // Check if user is admin
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        
        console.log("Current user:", user.id, "Role:", profile?.role);
        
        if (profile?.role !== "admin") {
          console.warn("User is not an admin. Cannot view all orders.");
          setOrders([]);
        } else {
          const { data: ordersData, error: ordersError } = await supabaseBrowser
            .from("merch_orders")
            .select("*")
            .order("created_at", { ascending: false });

          if (ordersError) {
            console.error("Error loading orders:", ordersError);
            console.error("Error code:", ordersError.code);
            console.error("Error message:", ordersError.message);
            console.error("Error details:", ordersError.details);
            console.error("Error hint:", ordersError.hint);
            // If it's a permissions error, try to provide helpful info
            if (ordersError.code === "PGRST301" || ordersError.message?.includes("permission") || ordersError.message?.includes("policy")) {
              console.error("RLS Policy Error: User may not have permission to view orders. Check if role='admin' in profiles table.");
            }
            setOrders([]);
          } else if (ordersData !== null && ordersData !== undefined) {
            console.log("Loaded orders:", ordersData.length, ordersData);
            // Filter based on showCompleted
            const filtered = showCompleted
              ? ordersData.filter((o) => o.status === "completed")
              : ordersData.filter((o) => o.status !== "completed");
            console.log("Filtered orders:", filtered.length, filtered);
            setOrders(filtered);
          } else {
            console.log("No orders data returned (null/undefined)");
            setOrders([]);
          }
        }
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleInventoryChange = (productId: string, size: string, value: number) => {
    const key = `${productId}-${size}`;
    setEditingInventory((prev) => ({
      ...prev,
      [key]: Math.max(0, value),
    }));
  };

  const saveInventory = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(editingInventory).map(([key, quantity]) => {
        // Split from the right to handle UUIDs correctly
        // Format: "uuid-uuid-uuid-uuid-uuid-SIZE"
        // We want the last part as size, everything else as product_id
        const lastDashIndex = key.lastIndexOf("-");
        const productId = key.substring(0, lastDashIndex);
        const size = key.substring(lastDashIndex + 1);
        return {
          product_id: productId,
          size,
          quantity,
        };
      });

      let hasError = false;
      for (const update of updates) {
        const { error } = await supabaseBrowser
          .from("merch_inventory")
          .upsert(
            {
              product_id: update.product_id,
              size: update.size,
              quantity: update.quantity,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "product_id,size",
            }
          );
        if (error) {
          console.error(`Error updating inventory for ${update.product_id}-${update.size}:`, error);
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
          console.error("Error details:", error.details);
          hasError = true;
        }
      }

      if (hasError) {
        alert("Some inventory updates failed. Check console for details.");
      } else {
        await loadData();
        alert("Inventory updated successfully!");
      }
    } catch (err) {
      console.error("Error saving inventory:", err);
      alert("Failed to update inventory: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    status: string,
    trackingNumber?: string,
    notes?: string
  ) => {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (trackingNumber !== undefined) {
        updateData.tracking_number = trackingNumber;
      }
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      const response = await fetch("/api/merch-order/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          ...updateData,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update order");
      }

      await loadData();
      setSelectedOrder(null);
      alert("Order updated successfully!");
    } catch (err) {
      console.error("Error updating order:", err);
      alert("Failed to update order");
    }
  };

  const getInventoryForProduct = (productId: string) => {
    return inventory.filter((item) => item.product_id === productId);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Loading admin dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-300 hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        Back to Merch
      </button>

      <h2 className="text-3xl font-bold text-primary mb-6">Admin Dashboard</h2>

      {/* Inventory Management */}
      <div className="bg-neutral-800 rounded-lg p-6 mb-6">
        <h3 className="text-2xl font-semibold text-white mb-4">
          Inventory Management
        </h3>
        <div className="space-y-6">
          {products.map((product) => {
            const productInventory = getInventoryForProduct(product.id);
            return (
              <div key={product.id} className="border-b border-neutral-700 pb-4 last:border-0">
                <h4 className="text-lg font-semibold text-primary mb-3">
                  {product.name}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
                  {product.availableSizes.map((size) => {
                    const key = `${product.id}-${size}`;
                    const currentQty = editingInventory[key] ?? 0;
                    const inventoryItem = productInventory.find(
                      (item) => item.size === size
                    );
                    return (
                      <div key={size} className="flex flex-col">
                        <label className="text-sm text-gray-400 mb-1">{size}</label>
                        <input
                          type="number"
                          min="0"
                          value={currentQty}
                          onChange={(e) =>
                            handleInventoryChange(
                              product.id,
                              size,
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {inventoryItem && (
                          <span className="text-xs text-gray-500 mt-1">
                            Current: {inventoryItem.quantity}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={saveInventory}
          disabled={saving}
          className="mt-6 btn-signup px-6 py-2 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Inventory"}
        </button>
      </div>

      {/* Order Management */}
      <div className="bg-neutral-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-semibold text-white">Orders</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-4 h-4 text-primary"
            />
            <span className="text-gray-300">Show Completed Orders</span>
          </label>
        </div>

        {orders.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            No {showCompleted ? "completed" : "pending"} orders.
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-neutral-700 rounded-lg p-4 cursor-pointer hover:bg-neutral-600 transition-colors"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-white">
                      Order #{order.id.slice(0, 8)}
                    </p>
                    <p className="text-gray-300">
                      {order.first_name} {order.last_name}
                    </p>
                    <p className="text-sm text-gray-400">{order.email}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">
                      ${order.total.toFixed(2)}
                    </p>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold mt-1 ${
                        order.status === "completed"
                          ? "bg-green-600 text-white"
                          : order.status === "shipped"
                          ? "bg-blue-600 text-white"
                          : order.status === "paid"
                          ? "bg-yellow-600 text-black"
                          : "bg-gray-600 text-white"
                      }`}
                    >
                      {order.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdate={updateOrderStatus}
        />
      )}
    </div>
  );
}

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onUpdate: (
    orderId: string,
    status: string,
    trackingNumber?: string,
    notes?: string
  ) => void;
}

function OrderDetailModal({
  order,
  onClose,
  onUpdate,
}: OrderDetailModalProps) {
  const [status, setStatus] = useState(order.status);
  const [trackingNumber, setTrackingNumber] = useState(
    order.tracking_number || ""
  );
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(order.id, status, trackingNumber, notes);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative bg-neutral-800 rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-primary">
              Order #{order.id.slice(0, 8)}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-primary"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <p className="text-sm text-gray-400">Customer</p>
              <p className="text-white">
                {order.first_name} {order.last_name}
              </p>
              <p className="text-gray-300">{order.email}</p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Order Date</p>
              <p className="text-white">
                {new Date(order.created_at).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Items</p>
              <div className="mt-2 space-y-1">
                {order.items.map((item: any, index: number) => (
                  <p key={index} className="text-white">
                    {item.productName} ({item.size}) × {item.quantity} - $
                    {(item.price * item.quantity).toFixed(2)}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-400">Delivery Method</p>
              <p className="text-white capitalize">{order.delivery_method}</p>
              {order.delivery_method === "ship" && order.shipping_address && (
                <div className="mt-2 text-gray-300">
                  <p>{order.shipping_address.address}</p>
                  <p>
                    {order.shipping_address.city}, {order.shipping_address.state}{" "}
                    {order.shipping_address.zip}
                  </p>
                </div>
              )}
              {order.tracking_number && (
                <div className="mt-2">
                  <p className="text-sm text-gray-400">Current Tracking Number</p>
                  <p className="text-white font-mono">{order.tracking_number}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm text-gray-400">Totals</p>
              <p className="text-white">Subtotal: ${order.subtotal.toFixed(2)}</p>
              <p className="text-white">Shipping: ${order.shipping.toFixed(2)}</p>
              <p className="text-white font-bold">
                Total: ${order.total.toFixed(2)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {order.delivery_method === "ship" && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Enter tracking number"
                  className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes..."
                rows={3}
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 btn-signup py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-neutral-700 text-white rounded-md hover:bg-neutral-600"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
