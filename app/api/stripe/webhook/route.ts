import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";

// Disable body parsing for webhook to get raw body
export const runtime = "nodejs";

// Route segment config for Next.js App Router
export const dynamic = "force-dynamic";

function getWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return s;
}

// Test endpoint to verify webhook route is accessible
export async function GET() {
  return NextResponse.json({ 
    message: "Stripe webhook endpoint is accessible",
    timestamp: new Date().toISOString(),
    env: {
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    }
  });
}

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log("=== WEBHOOK RECEIVED ===", timestamp);
  console.log("Headers:", {
    "stripe-signature": request.headers.get("stripe-signature") ? "present" : "missing",
    "content-type": request.headers.get("content-type"),
    "user-agent": request.headers.get("user-agent"),
  });
  
  try {
    const rawBody = await request.text();
    console.log("Raw body length:", rawBody.length);
    
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      console.error("Webhook: Missing stripe-signature header");
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, sig, getWebhookSecret());
      console.log("Webhook event type:", event.type);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err?.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err?.message}` },
        { status: 400 }
      );
    }

    if (event.type !== "checkout.session.completed") {
      console.log("Webhook: Ignoring event type:", event.type);
      return NextResponse.json({ received: true });
    }

    console.log("Webhook: Processing checkout.session.completed");

    const session = event.data.object as Stripe.Checkout.Session;
    const referenceId = session.client_reference_id;
    if (!referenceId) {
      console.error("Webhook: checkout.session.completed missing client_reference_id");
      return NextResponse.json(
        { error: "Missing client_reference_id" },
        { status: 400 }
      );
    }

    // Check if this is an event signup payment
    // Event signups have signup_id in metadata, or payment_type === "cash_to_stripe" or "stripe_checkout"
    const hasSignupId = !!session.metadata?.signup_id;
    const isCashToStripe = session.metadata?.payment_type === "cash_to_stripe";
    const isStripeCheckout = session.metadata?.payment_type === "stripe_checkout";
    const isEventSignup = hasSignupId || isCashToStripe || isStripeCheckout;
    
    console.log("Webhook: Checking event signup", {
      hasSignupId,
      isCashToStripe,
      isStripeCheckout,
      isEventSignup,
      paymentType: session.metadata?.payment_type,
      metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
      referenceId
    });
    
    if (isEventSignup) {
      const signupId = session.metadata?.signup_id || referenceId;
      console.log("Webhook: Processing event signup", { signupId, sessionId: session.id });
      
      // If this is a new Stripe checkout (not cash-to-stripe), create the signup record
      if (isStripeCheckout) {
        console.log("Webhook: Processing stripe_checkout payment", { signupId, sessionId: session.id });
        const metadata = session.metadata;
        if (!metadata) {
          console.error("Webhook: Missing metadata for stripe_checkout", { sessionId: session.id });
          return NextResponse.json(
            { error: "Missing metadata" },
            { status: 400 }
          );
        }

        console.log("Webhook: Metadata received", { 
          signupId, 
          eventId: metadata.event_id,
          email: metadata.email,
          hasAllFields: !!(metadata.first_name && metadata.last_name && metadata.email)
        });

        // Check if signup already exists (idempotency)
        const { data: existingSignup, error: fetchExistingError } = await supabaseServer
          .from("signups")
          .select("*")
          .eq("id", signupId)
          .single();

        if (fetchExistingError && fetchExistingError.code !== "PGRST116") {
          // PGRST116 is "not found" which is expected for new signups
          console.error("Webhook: Error checking for existing signup", signupId, fetchExistingError);
        }

        if (existingSignup) {
          console.log("Webhook: Signup already exists", signupId);
          // Signup already exists, just ensure it's marked as paid
          if (existingSignup.paid) {
            console.log("Webhook: Signup already paid, returning", signupId);
            return NextResponse.json({ received: true }); // idempotent
          }
          
          const { error: updateError } = await supabaseServer
            .from("signups")
            .update({
              paid: true,
              payment_method: "Stripe",
              updated_at: new Date().toISOString(),
            })
            .eq("id", signupId);

          if (updateError) {
            console.error("Webhook: failed to update existing signup", signupId, updateError);
            return NextResponse.json(
              { error: "Failed to update signup" },
              { status: 500 }
            );
          }
          console.log("Webhook: Updated existing signup to paid", signupId);
        } else {
          console.log("Webhook: Creating new signup", signupId);
          // Create new signup record with paid: true
          // Note: Don't specify 'id' - let database auto-generate it (it's a bigint, not UUID)
          // We'll use client_reference_id to look it up later if needed
          const { data: newSignup, error: insertError } = await supabaseServer
            .from("signups")
            .insert([
              {
                event_id: metadata.event_id,
                event_title: metadata.event_title,
                first_name: metadata.first_name,
                last_name: metadata.last_name,
                email: metadata.email,
                been_before: metadata.been_before,
                heard_about_us: metadata.heard_about_us || null,
                payment_method: "Stripe",
                accept_liability: metadata.accept_liability === "true",
                accept_payment: metadata.accept_payment === "true",
                paid: true,
              },
            ])
            .select()
            .single();

          if (insertError) {
            console.error("Webhook: failed to create signup", signupId, insertError);
            console.error("Webhook: Insert error details", {
              code: insertError.code,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint
            });
            return NextResponse.json(
              { error: "Failed to create signup", details: insertError.message },
              { status: 500 }
            );
          }
          console.log("Webhook: Successfully created signup", { originalSignupId: signupId, databaseId: newSignup?.id });
          
          // Use the newly created signup for email sending
          const signup = newSignup;
          
          // Send confirmation email for paid event signup
          const html = `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
                  .content { background-color: #f9f9f9; padding: 20px; }
                  .payment-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                  .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>Country City Swing</h1>
                    <h2>Payment Confirmed</h2>
                  </div>
                  <div class="content">
                    <p>Hi ${signup.first_name},</p>
                    <p>Your payment for <strong>${signup.event_title}</strong> has been confirmed!</p>
                    <div class="payment-box">
                      <p style="margin: 0;"><strong>Payment Status:</strong> Paid via Stripe</p>
                    </div>
                    <p>Thank you for your payment. We're excited to see you at the event!</p>
                    <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions, please contact us at contact.us@countrycityswing.dance</p>
                  </div>
                  <div class="footer">
                    <p>Country City Swing<br>Nashville, TN</p>
                  </div>
                </div>
              </body>
            </html>
          `;

          try {
            console.log("Webhook: Sending payment confirmation email to:", signup.email);
            await sendHtmlEmail(
              signup.email,
              `Payment Confirmed - ${signup.event_title}`,
              html
            );
            console.log("Webhook: Payment confirmation email sent successfully");
          } catch (e) {
            console.error("Webhook: error sending payment confirmation email", e);
          }

          console.log("Webhook: Successfully processed new Stripe checkout signup:", signupId);
          return NextResponse.json({ received: true });
        }

        // If we get here, the signup already existed - fetch it for email sending
        const { data: signup, error: fetchError } = await supabaseServer
          .from("signups")
          .select("*")
          .eq("id", signupId)
          .single();

        if (fetchError || !signup) {
          console.error("Webhook: failed to fetch existing signup", signupId, fetchError);
          return NextResponse.json(
            { error: "Failed to fetch signup" },
            { status: 500 }
          );
        }

        // Send confirmation email for paid event signup
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
                .content { background-color: #f9f9f9; padding: 20px; }
                .payment-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Country City Swing</h1>
                  <h2>Payment Confirmed</h2>
                </div>
                <div class="content">
                  <p>Hi ${signup.first_name},</p>
                  <p>Your payment for <strong>${signup.event_title}</strong> has been confirmed!</p>
                  <div class="payment-box">
                    <p style="margin: 0;"><strong>Payment Status:</strong> Paid via Stripe</p>
                  </div>
                  <p>Thank you for your payment. We're excited to see you at the event!</p>
                  <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions, please contact us at contact.us@countrycityswing.dance</p>
                </div>
                <div class="footer">
                  <p>Country City Swing<br>Nashville, TN</p>
                </div>
              </div>
            </body>
          </html>
        `;

        try {
          console.log("Webhook: Sending payment confirmation email to:", signup.email);
          await sendHtmlEmail(
            signup.email,
            `Payment Confirmed - ${signup.event_title}`,
            html
          );
          console.log("Webhook: Payment confirmation email sent successfully");
        } catch (e) {
          console.error("Webhook: error sending payment confirmation email", e);
        }

        console.log("Webhook: Successfully processed new Stripe checkout signup:", signupId);
        return NextResponse.json({ received: true });
      }

      // Handle cash-to-stripe conversion (existing signup, just update paid status)
      if (isCashToStripe) {
        const { data: signup, error: fetchError } = await supabaseServer
          .from("signups")
          .select("*")
          .eq("id", signupId)
          .single();

        if (fetchError || !signup) {
          console.error("Webhook: signup not found for client_reference_id", signupId, fetchError);
          return NextResponse.json(
            { error: "Signup not found" },
            { status: 404 }
          );
        }

        if (signup.paid) {
          return NextResponse.json({ received: true }); // idempotent
        }

        const { error: updateError } = await supabaseServer
          .from("signups")
          .update({
            paid: true,
            payment_method: "Stripe", // Update payment method to Stripe
            updated_at: new Date().toISOString(),
          })
          .eq("id", signupId);

        if (updateError) {
          console.error("Webhook: failed to update signup", signupId, updateError);
          return NextResponse.json(
            { error: "Failed to update signup" },
            { status: 500 }
          );
        }

        // Send confirmation email for paid event signup
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
                .content { background-color: #f9f9f9; padding: 20px; }
                .payment-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Country City Swing</h1>
                  <h2>Payment Confirmed</h2>
                </div>
                <div class="content">
                  <p>Hi ${signup.first_name},</p>
                  <p>Your payment for <strong>${signup.event_title}</strong> has been confirmed!</p>
                  <div class="payment-box">
                    <p style="margin: 0;"><strong>Payment Status:</strong> Paid via Stripe</p>
                  </div>
                  <p>Thank you for your payment. We're excited to see you at the event!</p>
                  <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions, please contact us at contact.us@countrycityswing.dance</p>
                </div>
                <div class="footer">
                  <p>Country City Swing<br>Nashville, TN</p>
                </div>
              </div>
            </body>
          </html>
        `;

        try {
          console.log("Webhook: Sending payment confirmation email to:", signup.email);
          await sendHtmlEmail(
            signup.email,
            `Payment Confirmed - ${signup.event_title}`,
            html
          );
          console.log("Webhook: Payment confirmation email sent successfully");
        } catch (e) {
          console.error("Webhook: error sending payment confirmation email", e);
        }

        console.log("Webhook: Successfully processed cash-to-stripe payment:", signupId);
        return NextResponse.json({ received: true });
      }
    }

    // Handle merch order payment (existing logic)
    const { data: order, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("*")
      .eq("id", referenceId)
      .single();

    if (fetchError || !order) {
      console.error("Webhook: order not found for client_reference_id", referenceId, fetchError);
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.status === "paid") {
      return NextResponse.json({ received: true }); // idempotent
    }

    const { error: updateError } = await supabaseServer
      .from("merch_orders")
      .update({
        status: "paid",
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", referenceId);

    if (updateError) {
      console.error("Webhook: failed to update order", referenceId, updateError);
      return NextResponse.json(
        { error: "Failed to update order" },
        { status: 500 }
      );
    }

    // Send "Paid" confirmation emails
    const orderItemsHtml = (order.items as any[])
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
      order.delivery_method === "ship" && order.shipping_address
        ? `
      <p><strong>Shipping Address:</strong></p>
      <p>
        ${(order.shipping_address as any).address}<br>
        ${(order.shipping_address as any).city}, ${(order.shipping_address as any).state} ${(order.shipping_address as any).zip}
      </p>
      <p><strong>Shipping Cost:</strong> $${Number(order.shipping).toFixed(2)}</p>
    `
        : "<p><strong>Delivery Method:</strong> Local Pickup</p>";

    const paymentBox = `
      <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> Paid.</p>
        <p style="margin: 5px 0 0 0;">Thank you for your payment. Your order is confirmed.</p>
      </div>
    `;

    const customerEmailHtml = `
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
              <p>Thank you for your order, ${order.first_name}!</p>
              <div class="order-details">
                <h3>Order Details</h3>
                <p><strong>Order Number:</strong> #${order.id}</p>
                <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
                <p><strong>Customer Name:</strong> ${order.first_name} ${order.last_name}</p>
                <p><strong>Email:</strong> ${order.email}</p>
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
                  <p><strong>Subtotal:</strong> $${Number(order.subtotal).toFixed(2)}</p>
                  <p><strong>Shipping:</strong> $${Number(order.shipping).toFixed(2)}</p>
                  <p style="font-size: 1.3em; margin-top: 10px;"><strong>Total:</strong> $${Number(order.total).toFixed(2)}</p>
                </div>
                <h4 style="margin-top: 20px; margin-bottom: 10px;">Delivery Information:</h4>
                ${shippingInfo}
              </div>
              ${paymentBox}
              <p>We'll notify you when your order is ready for ${order.delivery_method === "ship" ? "shipping" : "pickup"}.</p>
              <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions, contact us at contact.us@countrycityswing.dance</p>
            </div>
            <div class="footer">
              <p>Country City Swing<br>Nashville, TN</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      console.log("Webhook: Sending customer confirmation email to:", order.email);
      await sendHtmlEmail(
        order.email,
        "Order Confirmation - Country City Swing",
        customerEmailHtml
      );
      console.log("Webhook: Customer confirmation email sent successfully");
    } catch (e) {
      console.error("Webhook: error sending customer confirmation email", e);
    }
    await delay(600);

    const merchEmailHtml = `
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
              <p><strong>Customer:</strong> ${order.first_name} ${order.last_name}</p>
              <p><strong>Email:</strong> ${order.email}</p>
              <p><strong>Payment:</strong> Paid (Stripe)</p>
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
                  <p>Subtotal: $${Number(order.subtotal).toFixed(2)}</p>
                  ${Number(order.shipping) > 0 ? `<p>Shipping: $${Number(order.shipping).toFixed(2)}</p>` : ""}
                  <p>Total: $${Number(order.total).toFixed(2)}</p>
                </div>
                ${shippingInfo}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      console.log("Webhook: Sending admin notification email to: merch@countrycityswing.dance");
      await sendHtmlEmail(
        "merch@countrycityswing.dance",
        `New Merch Order #${order.id} (Paid) - ${order.first_name} ${order.last_name}`,
        merchEmailHtml
      );
      console.log("Webhook: Admin notification email sent successfully");
    } catch (e) {
      console.error("Webhook: error sending merch notification email", e);
    }

    console.log("Webhook: Successfully processed order:", referenceId);
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json(
      { error: error?.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}
