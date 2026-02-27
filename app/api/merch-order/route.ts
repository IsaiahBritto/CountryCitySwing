import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";
import { getStripe } from "@/lib/stripe";
import { calculateProcessingFee, roundCurrency } from "@/lib/utils/paymentHelpers";
import { getMerchandiseTaxCode, getShippingTaxCode, getProcessingFeeTaxCode } from "@/lib/utils/stripeTaxCodes";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("host") || "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  try {
    const base = getBaseUrl(request);
    const orderData = await request.json();
    const paymentMethod = orderData.paymentMethod ?? "cash";

    if (!["cash", "stripe"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Invalid payment method" },
        { status: 400 }
      );
    }

    if (
      !orderData.firstName ||
      !orderData.lastName ||
      !orderData.email ||
      !orderData.items ||
      orderData.items.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check inventory before proceeding
    for (const item of orderData.items) {
      const { data: inventory } = await supabaseServer
        .from("merch_inventory")
        .select("quantity")
        .eq("product_id", item.productId)
        .eq("size", item.size)
        .single();

      const availableQty = inventory?.quantity ?? 999;
      if (availableQty < item.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient inventory for ${item.productName} (${item.size}). Only ${availableQty} available.`,
          },
          { status: 400 }
        );
      }
    }

    const orderTotalForDiscount = orderData.subtotal + (orderData.shipping || 0);
    const promotionCodeId = orderData.promotionCodeId;
    const clientDiscountedSubtotal =
      typeof orderData.discountedSubtotal === "number"
        ? orderData.discountedSubtotal
        : typeof orderData.discounted_subtotal === "number"
          ? orderData.discounted_subtotal
          : undefined;
    let paid = false;
    let amountOwed = orderTotalForDiscount;
    let effectivePaymentMethod = paymentMethod;

    if (clientDiscountedSubtotal != null && Number.isFinite(clientDiscountedSubtotal)) {
      amountOwed = roundCurrency(Math.max(0, clientDiscountedSubtotal));
      paid = amountOwed <= 0;
    }

    // Stripe not allowed when amount due is under $1
    if (paymentMethod === "stripe" && amountOwed < 1) {
      effectivePaymentMethod = "cash";
    }

    // 1️⃣ Stripe path: if promo brings total to ≤$0.50, treat as Cash with no payment; or if already resolved from client discount
    if (effectivePaymentMethod === "stripe") {
      let discountedTotal = amountOwed;
      if (clientDiscountedSubtotal == null && promotionCodeId && orderTotalForDiscount > 0) {
        const processingFee = roundCurrency(calculateProcessingFee(orderTotalForDiscount));
        discountedTotal = orderTotalForDiscount + processingFee;
        try {
          const stripe = getStripe();
          const promo = await stripe.promotionCodes.retrieve(promotionCodeId, {
            expand: ["coupon"],
          });
          const coupon = (promo as { coupon?: Stripe.Coupon }).coupon;
          if (coupon) {
            const totalBeforeDiscount = orderTotalForDiscount + processingFee;
            if (coupon.amount_off != null) {
              discountedTotal = Math.max(0, totalBeforeDiscount - coupon.amount_off / 100);
            } else if (coupon.percent_off != null) {
              discountedTotal = Math.max(0, totalBeforeDiscount * (1 - coupon.percent_off / 100));
            }
          }
        } catch (e) {
          console.error("Merch order: could not resolve promo for Stripe total check", e);
        }
      }
      if (discountedTotal <= 0.5) {
        effectivePaymentMethod = "cash";
        paid = true;
        amountOwed = 0;
      } else {
        try {
          const subtotalForFee = orderData.subtotal + (orderData.shipping || 0);
          const processingFee = roundCurrency(calculateProcessingFee(subtotalForFee));
          const lineItems: { price_data: any; quantity: number }[] = orderData.items.map(
            (item: any) => ({
              price_data: {
                currency: "usd",
                product_data: {
                  name: `${item.productName} (${item.size})`,
                  tax_code: getMerchandiseTaxCode(),
                },
                unit_amount: Math.round(item.price * 100),
              },
              quantity: item.quantity,
            })
          );
          if (orderData.shipping > 0) {
            lineItems.push({
              price_data: {
                currency: "usd",
                product_data: { name: "Shipping", tax_code: getShippingTaxCode() },
                unit_amount: Math.round(orderData.shipping * 100),
              },
              quantity: 1,
            });
          }
          if (processingFee > 0) {
            lineItems.push({
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Processing Fee",
                  description: "Payment processing fee",
                  tax_code: "txcd_99999999",
                },
                unit_amount: Math.round(processingFee * 100),
              },
              quantity: 1,
            });
          }
          const sessionParams: any = {
            mode: "payment",
            payment_method_types: ["card"],
            line_items: lineItems,
            automatic_tax: { enabled: true },
            ...(promotionCodeId
              ? { discounts: [{ promotion_code: promotionCodeId }] }
              : { allow_promotion_codes: true }),
            customer_email: orderData.email,
            billing_address_collection: "auto",
            shipping_address_collection: orderData.deliveryMethod === "ship"
              ? { allowed_countries: ["US"] }
              : undefined,
            metadata: {
              first_name: orderData.firstName,
              last_name: orderData.lastName,
              email: orderData.email,
              delivery_method: orderData.deliveryMethod,
              shipping_address: orderData.shippingAddress ? JSON.stringify(orderData.shippingAddress) : "",
              items: JSON.stringify(orderData.items),
              subtotal: String(orderData.subtotal),
              shipping: String(orderData.shipping),
              processing_fee: String(processingFee),
              total: String(orderData.total),
              payment_method: paymentMethod,
              payment_type: "merch_order",
            },
            success_url: `${base}/merch/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/merch/checkout`,
          };
          const session = await getStripe().checkout.sessions.create(sessionParams);
          return NextResponse.json({ success: true, redirect: session.url! });
        } catch (stripeError: any) {
          console.error("Stripe error:", stripeError);
          return NextResponse.json(
            { error: "Failed to create Stripe session", details: stripeError.message },
            { status: 500 }
          );
        }
      }
    }

    // 2️⃣ Cash path: if promo applied and we didn't get discount from client, resolve from Stripe
    if (
      effectivePaymentMethod === "cash" &&
      promotionCodeId &&
      orderTotalForDiscount > 0 &&
      clientDiscountedSubtotal == null
    ) {
      try {
        const stripe = getStripe();
        const promo = await stripe.promotionCodes.retrieve(promotionCodeId, {
          expand: ["coupon"],
        });
        const coupon = (promo as { coupon?: Stripe.Coupon }).coupon;
        if (coupon) {
          let discounted = orderTotalForDiscount;
          if (coupon.amount_off != null) {
            discounted = Math.max(0, orderTotalForDiscount - coupon.amount_off / 100);
          } else if (coupon.percent_off != null) {
            discounted = Math.max(0, orderTotalForDiscount * (1 - coupon.percent_off / 100));
          }
          paid = discounted <= 0;
          amountOwed = roundCurrency(discounted);
        }
      } catch (e) {
        console.error("Merch order: could not resolve promo for paid check", e);
      }
    }

    const { data: order, error: orderError } = await supabaseServer
      .from("merch_orders")
      .insert({
        first_name: orderData.firstName,
        last_name: orderData.lastName,
        email: orderData.email,
        delivery_method: orderData.deliveryMethod,
        shipping_address: orderData.shippingAddress,
        items: orderData.items,
        subtotal: orderData.subtotal,
        shipping: orderData.shipping,
        total: orderData.total,
        status: "pending",
        paid,
        payment_method: effectivePaymentMethod,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order", details: orderError.message },
        { status: 500 }
      );
    }

    // Cash: send "Cash payment needed" emails
    const paymentLink = `${base}/merch/checkout/pay/${order.id}`;
    
    const orderItemsHtml = orderData.items
      .map(
        (item: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.productName} (${item.size})</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `
      )
      .join("");

    const shippingInfo =
      orderData.deliveryMethod === "ship"
        ? `
      <p><strong>Shipping Address:</strong></p>
      <p>
        ${orderData.shippingAddress.address}<br>
        ${orderData.shippingAddress.city}, ${orderData.shippingAddress.state} ${orderData.shippingAddress.zip}
      </p>
      <p><strong>Shipping Cost:</strong> $${orderData.shipping.toFixed(2)}</p>
    `
        : "<p><strong>Delivery Method:</strong> Local Pickup</p>";

    const paymentBoxCash = paid
      ? `
      <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> No payment needed &mdash; your promotion code covered the full cost.</p>
      </div>
    `
      : `
      <div style="background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> Cash payment selected.</p>
        <p style="margin: 10px 0 0 0;"><strong>${promotionCodeId ? "Amount Due (After Discount):" : "Amount Due:"}</strong> $${amountOwed.toFixed(2)}</p>
        <p style="margin: 10px 0 0 0;">You can pay with cash in person, or click the link below to pay online via Stripe:</p>
        <p style="margin: 10px 0 0 0;">
          <a href="${paymentLink}" style="display: inline-block; background-color: #F2C94C; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
            Pay Online via Stripe
          </a>
        </p>
        <p style="margin: 10px 0 0 0; font-size: 0.9em;">If paying cash, please show this confirmation email when picking up your order.</p>
      </div>
    `;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .order-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; }
            th { background-color: #f2c94c; color: #000; padding: 10px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            .total { font-size: 1.2em; font-weight: bold; margin-top: 15px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Country City Swing</h1>
              <h2>Order Confirmation</h2>
            </div>
            <div class="content">
              <p>Thank you for your order, ${orderData.firstName}!</p>
              <div class="order-details">
                <h3>Order Details</h3>
                <p><strong>Order Number:</strong> #${order.id}</p>
                <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Customer Name:</strong> ${orderData.firstName} ${orderData.lastName}</p>
                <p><strong>Email:</strong> ${orderData.email}</p>
                <h4 style="margin-top: 20px; margin-bottom: 10px;">Items Ordered:</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style="text-align: center;">Quantity</th>
                      <th style="text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>${orderItemsHtml}</tbody>
                </table>
                <div class="total">
                  <p><strong>Subtotal:</strong> $${orderData.subtotal.toFixed(2)}</p>
                  <p><strong>Shipping:</strong> $${orderData.shipping.toFixed(2)}</p>
                  ${promotionCodeId ? `<p><strong>Amount due (after discount):</strong> $${amountOwed.toFixed(2)}</p>` : ""}
                  <p style="font-size: 1.3em; margin-top: 10px;"><strong>Total:</strong> $${Number(orderData.total).toFixed(2)}${promotionCodeId ? " (after discount)" : ""}</p>
                </div>
                <h4 style="margin-top: 20px; margin-bottom: 10px;">Delivery Information:</h4>
                ${shippingInfo}
              </div>
              ${paymentBoxCash}
              <p>We'll process your order once payment is received. You'll receive another email when your order is ready for ${orderData.deliveryMethod === "ship" ? "shipping" : "pickup"}.</p>
              <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions about your order, please contact us at contact.us@countrycityswing.dance</p>
            </div>
            <div class="footer">
              <p>Country City Swing<br>Nashville, TN</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await sendHtmlEmail(
        orderData.email,
        "Order Confirmation - Country City Swing",
        emailHtml
      );
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
    }
    await delay(600);

    const notificationEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .order-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; }
            th { background-color: #f2c94c; color: #000; padding: 10px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            .total { font-size: 1.2em; font-weight: bold; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>New Merch Order</h1></div>
            <div class="content">
              <p><strong>Order Number:</strong> #${order.id}</p>
              <p><strong>Customer:</strong> ${orderData.firstName} ${orderData.lastName}</p>
              <p><strong>Email:</strong> ${orderData.email}</p>
              <p><strong>Payment:</strong> Cash payment needed.</p>
              <div class="order-details">
                <h3>Order Items</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style="text-align: center;">Quantity</th>
                      <th style="text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>${orderItemsHtml}</tbody>
                </table>
                <div class="total">
                  <p>Subtotal: $${orderData.subtotal.toFixed(2)}</p>
                  ${orderData.shipping > 0 ? `<p>Shipping: $${orderData.shipping.toFixed(2)}</p>` : ""}
                  <p>Total: $${orderData.total.toFixed(2)}</p>
                </div>
                ${shippingInfo}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await sendHtmlEmail(
        "merch@countrycityswing.dance",
        `New Merch Order #${order.id} - ${orderData.firstName} ${orderData.lastName}`,
        notificationEmailHtml
      );
    } catch (emailError: any) {
      console.error("Error sending merch notification email:", emailError);
    }

    // Redirect to success page with order_id for cash payments
    return NextResponse.json({ 
      success: true, 
      orderId: order.id,
      redirect: `${base}/merch/checkout/success?order_id=${order.id}`
    });
  } catch (error: any) {
    console.error("Order submission error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error", details: error.stack },
      { status: 500 }
    );
  }
}
