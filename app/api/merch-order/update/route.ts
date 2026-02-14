import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";

export async function POST(request: NextRequest) {
  try {
    const updateData = await request.json();
    const {
      orderId,
      status,
      trackingNumber: trackingNumberCamel,
      tracking_number: trackingNumberSnake,
      notes,
    } = updateData;
    const trackingNumber = trackingNumberCamel ?? trackingNumberSnake;

    if (!orderId || !status) {
      return NextResponse.json(
        { error: "Order ID and status are required" },
        { status: 400 }
      );
    }

    // Get the current order to check for status changes
    const { data: currentOrder, error: fetchError } = await supabaseServer
      .from("merch_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !currentOrder) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Update the order
    const updatePayload: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (trackingNumber !== undefined) {
      updatePayload.tracking_number = trackingNumber;
    }
    if (notes !== undefined) {
      updatePayload.notes = notes;
    }

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("merch_orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating order:", updateError);
      return NextResponse.json(
        { error: "Failed to update order" },
        { status: 500 }
      );
    }

    // Send email notification if status changed
    if (currentOrder.status !== status) {
      try {
        const statusMessages: { [key: string]: string } = {
          processing: "Your order is now being processed and prepared for shipment.",
          shipped: "Your order has been shipped!",
          completed: "Your order has been completed and delivered.",
          cancelled: "Your order has been cancelled.",
        };

        const trackingInfo =
          status === "shipped" && trackingNumber
            ? `<p><strong>Tracking Number:</strong> ${trackingNumber}</p>`
            : "";

        // Build order items HTML
        const orderItemsHtml = currentOrder.items
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
          currentOrder.delivery_method === "ship" && currentOrder.shipping_address
            ? `
          <p><strong>Shipping Address:</strong></p>
          <p>
            ${currentOrder.shipping_address.address}<br>
            ${currentOrder.shipping_address.city}, ${currentOrder.shipping_address.state} ${currentOrder.shipping_address.zip}
          </p>
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
                .status-box { background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 15px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Country City Swing</h1>
                  <h2>Order Status Update</h2>
                </div>
                <div class="content">
                  <p>Hello ${currentOrder.first_name},</p>
                  
                  <div class="status-box">
                    <p><strong>Order #${orderId.slice(0, 8)} Status Update</strong></p>
                    <p><strong>New Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
                    <p>${statusMessages[status] || "Your order status has been updated."}</p>
                    ${trackingInfo}
                  </div>
                  
                  <div class="order-details">
                    <h3>Order Details</h3>
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
                    
                    <div style="margin-top: 15px;">
                      <p><strong>Subtotal:</strong> $${currentOrder.subtotal.toFixed(2)}</p>
                      ${currentOrder.shipping > 0 ? `<p><strong>Shipping:</strong> $${currentOrder.shipping.toFixed(2)}</p>` : ""}
                      <p><strong>Total:</strong> $${currentOrder.total.toFixed(2)}</p>
                    </div>
                    
                    ${shippingInfo}
                  </div>
                  
                  <p>If you have any questions about your order, please contact us at contact.us@countrycityswing.dance</p>
                </div>
                <div class="footer">
                  <p>Country City Swing<br>Nashville, TN</p>
                </div>
              </div>
            </body>
          </html>
        `;

        await sendHtmlEmail(
          currentOrder.email,
          `Order Status Update - Order #${orderId.slice(0, 8)}`,
          emailHtml
        );
      } catch (emailError) {
        console.error("Error sending status update email:", emailError);
        // Don't fail the update if email fails
      }
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    console.error("Order update error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
