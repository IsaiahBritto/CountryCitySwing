"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ProductModal from "@/components/ProductModal";
import Cart from "@/components/Cart";
import AdminDashboard from "@/components/AdminDashboard";

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

export default function MerchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // Check if user is admin
  useEffect(() => {
    async function checkAdmin() {
      try {
        const {
          data: { user },
        } = await supabaseBrowser.auth.getUser();
        if (user) {
          const { data: profile } = await supabaseBrowser
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          setIsAdmin(profile?.role === "admin");
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
      }
    }
    checkAdmin();
  }, []);

  useEffect(() => {
    async function loadProducts() {
      try {
        // Fetch products from Supabase
        const { data, error } = await supabase
          .from("merch_products")
          .select("*")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }); // Secondary sort by name

        if (error) {
          console.error("Error loading products:", error);
          // Fallback to default products if table doesn't exist yet
          setProducts(getDefaultProducts());
        } else if (data && data.length > 0) {
          // Transform Supabase data to Product format
          const transformedProducts = await Promise.all(
            data.map(async (product: any) => {
              // Fetch images for this product
              const { data: images } = await supabase
                .from("merch_product_images")
                .select("*")
                .eq("product_id", product.id)
                .order("display_order");

              const productImages: ProductImage[] =
                images?.map((img: any) => ({
                  id: img.id,
                  url: img.image_url,
                  alt: img.alt_text || product.name,
                })) || [];

              // Get main image URL (first image or placeholder)
              const mainImageUrl =
                productImages[0]?.url ||
                product.main_image_url ||
                "/placeholder-product.jpg";

              return {
                id: product.id,
                name: product.name,
                type: product.type,
                price: product.price,
                images: productImages.length > 0 ? productImages : [
                  { id: "main", url: mainImageUrl, alt: product.name },
                ],
                availableSizes: product.available_sizes || [],
                mainImageUrl,
              };
            })
          );
          setProducts(transformedProducts);
        } else {
          // No products in database, use defaults
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Loading products...</p>
      </div>
    );
  }

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
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-primary">
          Country City Swing Merch
        </h1>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <button
              onClick={() => setShowAdminDashboard(true)}
              className="btn-signup text-sm px-4 py-2 rounded-md"
            >
              Admin
            </button>
          )}
          <Cart />
        </div>
      </div>

      {products.length === 0 ? (
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
