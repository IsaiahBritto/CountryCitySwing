"use client";

import { useState, useEffect } from "react";
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useCart } from "./CartContext";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  formatMerchPreorderEnd,
  isMerchPreorderClosed,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from "@/lib/merchPreorder";

interface ProductImage {
  id: string;
  url: string;
  alt?: string;
}

export interface MerchProduct {
  id: string;
  name: string;
  type: string;
  price: number;
  images: ProductImage[];
  availableSizes: string[];
  preorderEndAt?: string | null;
  unlimitedInventory?: boolean;
}

interface InventoryItem {
  size: string;
  quantity: number;
}

interface ProductModalProps {
  product: MerchProduct;
  isOpen: boolean;
  onClose: () => void;
  inventoryByProduct?: InventoryItem[];
  isAdmin?: boolean;
  onProductUpdated?: (product: MerchProduct) => void;
}

export default function ProductModal({
  product,
  isOpen,
  onClose,
  inventoryByProduct,
  isAdmin = false,
  onProductUpdated,
}: ProductModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [preorderEndLocal, setPreorderEndLocal] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const { addToCart } = useCart();

  const preorderClosed = isMerchPreorderClosed(product.preorderEndAt);
  const unlimited = product.unlimitedInventory === true;

  useEffect(() => {
    if (isOpen && product.id) {
      setCurrentImageIndex(0);
      setSelectedSize("");
      setAdminMessage("");
      setPreorderEndLocal(isoToDatetimeLocalValue(product.preorderEndAt ?? null));
      if (inventoryByProduct !== undefined) {
        setInventory(inventoryByProduct);
      } else {
        loadInventory();
      }
    }
  }, [isOpen, product.id, product.preorderEndAt, inventoryByProduct]);

  async function loadInventory() {
    try {
      const { data } = await supabase
        .from("merch_inventory")
        .select("size, quantity")
        .eq("product_id", product.id);

      if (data) {
        setInventory(data);
      }
    } catch (err) {
      console.error("Error loading inventory:", err);
    }
  }

  const getQuantityForSize = (size: string): number => {
    if (unlimited) return 999999;
    const item = inventory.find((inv) => inv.size === size);
    return item?.quantity ?? 999;
  };

  const isSizeAvailable = (size: string): boolean => {
    if (preorderClosed && !isAdmin) return false;
    return getQuantityForSize(size) > 0;
  };

  const canAddToCart = !preorderClosed || isAdmin;

  if (!isOpen) return null;

  const handleAddToCart = () => {
    if (!canAddToCart) return;
    if (!selectedSize) {
      alert("Please select a size");
      return;
    }
    if (!isSizeAvailable(selectedSize)) {
      alert("This size is currently out of stock");
      return;
    }
    addToCart({
      productId: product.id,
      productName: product.name,
      productType: product.type,
      size: selectedSize,
      price: product.price,
      imageUrl: product.images[0]?.url || "",
      preorderEndAt: product.preorderEndAt ?? null,
      unlimitedInventory: unlimited,
    });
    onClose();
  };

  const savePreorderEnd = async (clear: boolean) => {
    setAdminSaving(true);
    setAdminMessage("");
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setAdminMessage("Sign in as admin to save.");
        return;
      }

      const preorderEndAt = clear
        ? null
        : datetimeLocalValueToIso(preorderEndLocal);

      if (!clear && preorderEndLocal.trim() && !preorderEndAt) {
        setAdminMessage("Invalid date/time.");
        return;
      }

      const res = await fetch(`/api/admin/merch-products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ preorderEndAt }),
      });
      const result = await res.json();
      if (!res.ok) {
        setAdminMessage(result.error || "Failed to save.");
        return;
      }

      const row = result.product;
      const updated: MerchProduct = {
        ...product,
        preorderEndAt: row.preorder_end_at ?? null,
        unlimitedInventory: row.unlimited_inventory ?? product.unlimitedInventory,
      };
      onProductUpdated?.(updated);
      setPreorderEndLocal(isoToDatetimeLocalValue(updated.preorderEndAt ?? null));
      setAdminMessage(clear ? "Preorder end date cleared." : "Preorder end date saved.");
    } catch (err) {
      console.error("savePreorderEnd:", err);
      setAdminMessage("Failed to save.");
    } finally {
      setAdminSaving(false);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % product.images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex(
      (prev) => (prev - 1 + product.images.length) % product.images.length
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative bg-neutral-800 rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white hover:text-primary transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="p-6">
          <div className="relative mb-6">
            {product.images.length > 0 && (
              <>
                <img
                  src={product.images[currentImageIndex].url}
                  alt={product.images[currentImageIndex].alt || product.name}
                  className="w-full h-auto rounded-lg"
                />
                {product.images.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeftIcon className="w-6 h-6" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRightIcon className="w-6 h-6" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                      {currentImageIndex + 1} / {product.images.length}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-primary">{product.name}</h2>
            <p className="text-xl font-semibold text-white">
              ${product.price.toFixed(2)}
            </p>

            {product.preorderEndAt && !preorderClosed && (
              <p className="text-sm text-yellow-400">
                Preorder — order by{" "}
                {formatMerchPreorderEnd(product.preorderEndAt)} (Central time).
              </p>
            )}
            {preorderClosed && (
              <p className="text-sm text-red-400">
                {isAdmin
                  ? "Preorder ended (hidden from shoppers). Update the end date below to reopen."
                  : "This preorder is closed and no longer available."}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select Size
              </label>
              <div className="flex flex-wrap gap-2">
                {product.availableSizes.map((size) => {
                  const available = isSizeAvailable(size);
                  const quantity = getQuantityForSize(size);
                  return (
                    <button
                      key={size}
                      onClick={() => available && setSelectedSize(size)}
                      disabled={!available}
                      className={`px-4 py-2 rounded-md border-2 transition-colors ${
                        !available
                          ? "border-neutral-700 bg-neutral-700/50 text-neutral-500 cursor-not-allowed opacity-50"
                          : selectedSize === size
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-neutral-600 text-gray-300 hover:border-neutral-500"
                      }`}
                      title={
                        !available
                          ? "Out of stock"
                          : unlimited
                          ? "Available"
                          : `Available: ${quantity}`
                      }
                    >
                      {size}
                      {!unlimited && available && quantity < 10 && (
                        <span className="ml-1 text-xs">({quantity})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!canAddToCart}
              className="w-full btn-signup py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to Cart
            </button>

            {isAdmin && (
              <div className="border-t border-neutral-600 pt-4 mt-4 space-y-3">
                <h3 className="text-lg font-semibold text-white">Admin: Preorder end</h3>
                <label className="block text-sm text-gray-300">
                  Orders close at this date/time (your local timezone)
                </label>
                <input
                  type="datetime-local"
                  value={preorderEndLocal}
                  onChange={(e) => setPreorderEndLocal(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => savePreorderEnd(false)}
                    disabled={adminSaving}
                    className="btn-signup px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {adminSaving ? "Saving…" : "Save end date"}
                  </button>
                  <button
                    type="button"
                    onClick={() => savePreorderEnd(true)}
                    disabled={adminSaving}
                    className="px-4 py-2 text-sm rounded-md border border-neutral-500 text-gray-300 hover:border-neutral-400 disabled:opacity-50"
                  >
                    Clear end date
                  </button>
                </div>
                {adminMessage && (
                  <p className="text-sm text-gray-300">{adminMessage}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
