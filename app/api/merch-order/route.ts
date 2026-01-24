import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";

export async function POST(request: NextRequest) {
  try {
    const orderData = await request.json();

    // Validate required fields
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

    // Check inventory availability before creating order
    for (const item of orderData.items) {
      const { data: inventory } = await supabaseServer
        .from("merch_inventory")
        .select("quantity")
        .eq("product_id", item.productId)
        .eq("size", item.size)
        .single();

      const availableQty = inventory?.quantity ?? 999; // Default to available if no record
      if (availableQty < item.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient inventory for ${item.productName} (${item.size}). Only ${availableQty} available.`,
          },
          { status: 400 }
        );
      }
    }

    // Insert order into database
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
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Send confirmation email to customer
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
                  <tbody>
                    ${orderItemsHtml}
                  </tbody>
                </table>
                
                <div class="total">
                  <p><strong>Subtotal:</strong> $${orderData.subtotal.toFixed(2)}</p>
                  <p><strong>Shipping:</strong> $${orderData.shipping.toFixed(2)}</p>
                  <p style="font-size: 1.3em; margin-top: 10px;"><strong>Total:</strong> $${orderData.total.toFixed(2)}</p>
                </div>
                
                <h4 style="margin-top: 20px; margin-bottom: 10px;">Delivery Information:</h4>
                ${shippingInfo}
              </div>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Payment Instructions:</strong></p>
                <p style="margin: 5px 0 0 0;">Please complete your payment via Venmo: <a href="https://www.venmo.com/u/CountryCitySwing" style="color: #000; font-weight: bold;">@CountryCitySwing</a></p>
                <p style="margin: 10px 0 0 0; font-size: 0.9em;">Please include your order number (#${order.id}) in the Venmo payment note.</p>
              </div>
              
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
      // Don't fail the order if email fails
    }

    // Send notification email to admin
    const adminEmailHtml = `
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
            <div class="header">
              <h1>New Merch Order</h1>
            </div>
            <div class="content">
              <p><strong>Order Number:</strong> #${order.id}</p>
              <p><strong>Customer:</strong> ${orderData.firstName} ${orderData.lastName}</p>
              <p><strong>Email:</strong> ${orderData.email}</p>
              
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
                  <tbody>
                    ${orderItemsHtml}
                  </tbody>
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
        "contact.us@countrycityswing.dance",
        `New Merch Order #${order.id} - ${orderData.firstName} ${orderData.lastName}`,
        adminEmailHtml
      );
    } catch (emailError) {
      console.error("Error sending admin notification email:", emailError);
    }

    // Send notification email to merch team
    try {
      await sendHtmlEmail(
        "merch@countrycityswing.dance",
        `New Merch Order #${order.id} - ${orderData.firstName} ${orderData.lastName}`,
        adminEmailHtml
      );
    } catch (emailError) {
      console.error("Error sending merch notification email:", emailError);
    }

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error: any) {
    console.error("Order submission error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
