"use client";

import { useState, useEffect } from "react";
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useCart } from "./CartContext";
import { supabase } from "@/lib/supabaseClient";

interface ProductImage {
  id: string;
  url: string;
  alt?: string;
}

interface Product {
  id: string;
  name: string;
  type: string;
  price: number;
  images: ProductImage[];
  availableSizes: string[];
}

interface InventoryItem {
  size: string;
  quantity: number;
}

interface ProductModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductModal({
  product,
  isOpen,
  onClose,
}: ProductModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const { addToCart } = useCart();

  useEffect(() => {
    if (isOpen && product.id) {
      loadInventory();
    }
  }, [isOpen, product.id]);

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
    const item = inventory.find((inv) => inv.size === size);
    return item?.quantity ?? 999; // Default to available if no inventory record
  };

  const isSizeAvailable = (size: string): boolean => {
    return getQuantityForSize(size) > 0;
  };

  if (!isOpen) return null;

  const handleAddToCart = () => {
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
    });
    onClose();
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
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white hover:text-primary transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="p-6">
          {/* Image Gallery */}
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

          {/* Product Info */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-primary">{product.name}</h2>
            <p className="text-xl font-semibold text-white">
              ${product.price.toFixed(2)}
            </p>

            {/* Size Selection */}
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
                          : `Available: ${quantity}`
                      }
                    >
                      {size}
                      {available && quantity < 10 && (
                        <span className="ml-1 text-xs">({quantity})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add to Cart Button */}
            <button
              onClick={handleAddToCart}
              className="w-full btn-signup py-3 text-lg font-semibold"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
