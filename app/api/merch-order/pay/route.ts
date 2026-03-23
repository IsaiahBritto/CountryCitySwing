import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { calculateProcessingFee, roundCurrency } from "@/lib/utils/paymentHelpers";
import { getMerchandiseTaxCode, getShippingTaxCode, getProcessingFeeTaxCode } from "@/lib/utils/stripeTaxCodes";

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("host") || "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, promotionCodeId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    // Fetch order
    const { data: order, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("id,first_name,last_name,email,delivery_method,shipping_address,items,subtotal,shipping,total,paid,payment_method")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Check if already paid
    if (order.paid) {
      return NextResponse.json(
        { error: "This order has already been paid for" },
        { status: 400 }
      );
    }

    // Check if payment method is cash
    if (order.payment_method !== "cash") {
      return NextResponse.json(
        { error: "This order is not eligible for cash payment conversion" },
        { status: 400 }
      );
    }

    // Calculate processing fee based on subtotal + shipping
    const subtotalForFee = Number(order.subtotal) + (Number(order.shipping) || 0);
    const processingFee = roundCurrency(calculateProcessingFee(subtotalForFee));

    // Build line items: products + shipping + processing fee
    const lineItems: { price_data: any; quantity: number }[] = (order.items as any[]).map(
      (item: any) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${item.productName} (${item.size})`,
            tax_code: getMerchandiseTaxCode(), // General - Tangible Goods (for merchandise/clothing)
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })
    );

    // Add shipping as a line item (taxable in Tennessee)
    if (order.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Shipping",
            tax_code: getShippingTaxCode(), // Shipping services (taxable in Tennessee)
          },
          unit_amount: Math.round(Number(order.shipping) * 100),
        },
        quantity: 1,
      });
    }

    // Add processing fee
    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Processing Fee",
            description: "Payment processing fee",
            tax_code: getProcessingFeeTaxCode(), // General - Tangible Goods (processing fees are typically tax-exempt)
          },
          unit_amount: Math.round(processingFee * 100),
        },
        quantity: 1,
      });
    }

    // Create Stripe checkout session
    const base = getBaseUrl(req);
    const sessionParams: any = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      automatic_tax: {
        enabled: true, // Enable Stripe Tax for automatic sales tax calculation
      },
      ...(promotionCodeId
        ? { discounts: [{ promotion_code: promotionCodeId }] }
        : { allow_promotion_codes: true }),
      customer_email: order.email,
      billing_address_collection: "auto",
      shipping_address_collection: order.delivery_method === "ship"
        ? { allowed_countries: ["US"] }
        : undefined,
      client_reference_id: orderId,
      metadata: {
        order_id: orderId,
        first_name: order.first_name,
        last_name: order.last_name,
        email: order.email,
        delivery_method: order.delivery_method,
        shipping_address: order.shipping_address ? JSON.stringify(order.shipping_address) : "",
        items: JSON.stringify(order.items),
        subtotal: String(order.subtotal),
        shipping: String(order.shipping),
        processing_fee: String(processingFee),
        total: String(order.total),
        payment_type: "cash_to_stripe_merch",
      },
      success_url: `${base}/merch/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/merch/checkout/pay/${orderId}`,
    };

    const session = await getStripe().checkout.sessions.create(sessionParams);

    return NextResponse.json({
      success: true,
      redirect: session.url!,
    });
  } catch (error: any) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { error: "Failed to create payment session", details: error.message },
      { status: 500 }
    );
  }
}
