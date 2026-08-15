"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ShoppingCartIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import ProductModal from "@/components/ProductModal";
import Cart from "@/components/Cart";
import AdminDashboard from "@/components/AdminDashboard";
import MerchGridSkeleton from "@/components/MerchGridSkeleton";

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
  mainImageUrl: string;
}

export type InventoryByProduct = Record<string, { size: string; quantity: number }[]>;

export default function MerchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryByProductId, setInventoryByProductId] = useState<InventoryByProduct>({});
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Check if user is signed in and admin (single /api/me call)
  useEffect(() => {
    async function checkUser() {
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        setIsSignedIn(!!session?.user);
        if (!session?.access_token) return;
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(data.profile?.role === "admin");
        }
      } catch (err) {
        console.error("Error checking user status:", err);
      }
    }
    checkUser();
  }, []);

  useEffect(() => {
    async function loadProducts() {
      try {
        // Fetch products from Supabase
        const { data, error } = await supabase
          .from("merch_products")
          .select("id,name,type,price,available_sizes,main_image_url")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }); // Secondary sort by name

        if (error) {
          console.error("Error loading products:", error);
          setProducts(getDefaultProducts());
        } else if (data && data.length > 0) {
          const productIds = data.map((p: any) => p.id);
          // Single query for all images (avoids N+1)
          const { data: allImages } = await supabase
            .from("merch_product_images")
            .select("id,product_id,image_url,alt_text")
            .in("product_id", productIds)
            .order("display_order");

          const imagesByProductId: Record<string, ProductImage[]> = {};
          (allImages || []).forEach((img: any) => {
            const list = imagesByProductId[img.product_id] ?? [];
            list.push({
              id: img.id,
              url: img.image_url,
              alt: img.alt_text ?? undefined,
            });
            imagesByProductId[img.product_id] = list;
          });

          const transformedProducts = data.map((product: any) => {
            const productImages =
              imagesByProductId[product.id]?.map((img) => ({
                ...img,
                alt: img.alt || product.name,
              })) ?? [];
            const mainImageUrl =
              productImages[0]?.url ||
              product.main_image_url ||
              "/placeholder-product.jpg";
            return {
              id: product.id,
              name: product.name,
              type: product.type,
              price: product.price,
              images:
                productImages.length > 0
                  ? productImages
                  : [{ id: "main", url: mainImageUrl, alt: product.name }],
              availableSizes: product.available_sizes || [],
              mainImageUrl,
            };
          });
          setProducts(transformedProducts);

          const { data: invData } = await supabase
            .from("merch_inventory")
            .select("product_id, size, quantity")
            .in("product_id", productIds);
          const byProduct: InventoryByProduct = {};
          (invData || []).forEach((row: any) => {
            const list = byProduct[row.product_id] ?? [];
            list.push({ size: row.size, quantity: row.quantity });
            byProduct[row.product_id] = list;
          });
          setInventoryByProductId(byProduct);
        } else {
          setProducts(getDefaultProducts());
        }
      } catch (err) {
        console.error("Error loading products:", err);
        setProducts(getDefaultProducts());
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  if (showAdminDashboard) {
    return (
      <AdminDashboard
        onBack={() => setShowAdminDashboard(false)}
        products={products}
      />
    );
  }

  return (
    <section className="max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-8">
        <h1 className="gold-wave page-title font-extrabold pb-2">
          Country City Swing Merch
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {isSignedIn && (
            <Link
              href="/merch/orders"
              className="btn-signup text-sm px-4 py-2 rounded-md inline-flex items-center gap-2"
            >
              <ClipboardDocumentListIcon className="w-5 h-5" />
              Show Orders
            </Link>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAdminDashboard(true)}
              className="btn-signup text-sm px-4 py-2 rounded-md"
            >
              Admin
            </button>
          )}
          <Suspense
            fallback={
              <div className="text-gray-300" aria-label="Shopping cart">
                <ShoppingCartIcon className="w-6 h-6" />
              </div>
            }
          >
            <Cart />
          </Suspense>
        </div>
      </div>

      {loading ? (
        <MerchGridSkeleton />
      ) : products.length === 0 ? (
        <p className="text-center text-gray-400 py-12">
          No products available at this time.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              onClick={() => handleProductClick(product)}
              className="bg-neutral-800 rounded-lg overflow-hidden cursor-pointer hover:shadow-[0_0_20px_rgba(242,201,76,0.3)] transition-all duration-200"
            >
              <div className="aspect-square relative overflow-hidden">
                <img
                  src={product.mainImageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                />
              </div>
              <div className="p-4">
                <h3 className="text-xl font-semibold text-white mb-2">
                  {product.name}
                </h3>
                <p className="text-primary text-lg font-bold">
                  ${product.price.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedProduct(null);
          }}
          inventoryByProduct={inventoryByProductId[selectedProduct.id]}
        />
      )}
    </section>
  );
}

// Default products if database is not set up yet
function getDefaultProducts(): Product[] {
  return [
    {
      id: "black-ccs-shirt",
      name: "Black CCS Shirt",
      type: "shirt",
      price: 25.0,
      images: [
        { id: "1", url: "/placeholder-product.jpg", alt: "Black CCS Shirt" },
      ],
      availableSizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
      mainImageUrl: "/placeholder-product.jpg",
    },
    {
      id: "black-ccs-crop",
      name: "Black CCS Crop",
      type: "crop",
      price: 25.0,
      images: [
        { id: "1", url: "/placeholder-product.jpg", alt: "Black CCS Crop" },
      ],
      availableSizes: ["XS", "S", "M", "L", "XL"],
      mainImageUrl: "/placeholder-product.jpg",
    },
    {
      id: "desert-pink-crop",
      name: "Desert Pink Crop",
      type: "crop",
      price: 25.0,
      images: [
        { id: "1", url: "/placeholder-product.jpg", alt: "Desert Pink Crop" },
      ],
      availableSizes: ["XS", "S", "M", "L", "XL"],
      mainImageUrl: "/placeholder-product.jpg",
    },
    {
      id: "black-ccs-8cc-shirt",
      name: "Black CCS x 8CC Shirt",
      type: "shirt",
      price: 25.0,
      images: [
        {
          id: "1",
          url: "/placeholder-product.jpg",
          alt: "Black CCS x 8CC Shirt",
        },
      ],
      availableSizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
      mainImageUrl: "/placeholder-product.jpg",
    },
    {
      id: "black-ccs-8cc-crop",
      name: "Black CCS x 8CC Crop",
      type: "crop",
      price: 25.0,
      images: [
        {
          id: "1",
          url: "/placeholder-product.jpg",
          alt: "Black CCS x 8CC Crop",
        },
      ],
      availableSizes: ["XS", "S", "M", "L", "XL"],
      mainImageUrl: "/placeholder-product.jpg",
    },
  ];
}
