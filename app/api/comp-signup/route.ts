import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { sendHtmlEmail } from "@/lib/mailer";
import { calculateProcessingFee, roundCurrency } from "@/lib/utils/paymentHelpers";
import { getEventTaxCode, getProcessingFeeTaxCode } from "@/lib/utils/stripeTaxCodes";
import { compSignupToken } from "@/lib/utils/qrCheckIn";
import { formatEventDateInChicago } from "@/lib/utils/dateHelpers";
import { makeQrCodeInlineAttachment } from "@/lib/qrCodeAttachment";

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
  const data = await req.json();
  const event = data.event ?? {};
  const eventId = event.id;
  const eventTitle = event.title ?? "Comp Event";
  const strictlySelected = !!data.strictly_selected;
  const jnjSelected = !!data.jnj_selected;
  const paymentMethod = (data.payment_method ?? "Stripe").trim();
  const amountOwed = roundCurrency(Number(data.amount_owed) || 0);
  const acceptLiability = !!data.accept_liability;
  const acceptPayment = !!data.accept_payment;
  const acceptRefund =
    data.accept_refund === true ||
    data.accept_refund === "true" ||
    data.acceptRefund === true;

  if (!eventId || !eventTitle) {
    return NextResponse.json(
      { error: "Missing event id or title" },
      { status: 400 }
    );
  }
  if (!strictlySelected && !jnjSelected) {
    return NextResponse.json(
      { error: "Select at least one division: Strictly or JnJ" },
      { status: 400 }
    );
  }
  if (!acceptLiability || !acceptPayment) {
    return NextResponse.json(
      { error: "You must accept the liability release and payment acknowledgment" },
      { status: 400 }
    );
  }

  const { data: eventRow, error: eventLookupError } = await supabaseServer
    .from("events")
    .select("refund_statement")
    .eq("id", eventId)
    .maybeSingle();

  if (eventLookupError) {
    console.error("[comp-signup] event lookup failed", eventLookupError);
    return NextResponse.json({ error: "Failed to load event." }, { status: 500 });
  }

  const refundStatement =
    eventRow?.refund_statement && String(eventRow.refund_statement).trim()
      ? String(eventRow.refund_statement).trim()
      : null;

  if (refundStatement && !acceptRefund) {
    return NextResponse.json(
      { error: "You must acknowledge the refund policy for this event." },
      { status: 400 }
    );
  }

  if (paymentMethod.toLowerCase() === "venmo") {
    return NextResponse.json(
      { error: "Venmo is not accepted. Please choose Stripe or Cash." },
      { status: 400 }
    );
  }

  // Sanity check: reject only if the same email is already registered for the *same division*
  // (User may submit one form for Strictly and another for JnJ.)
  const norm = (e: unknown) =>
    typeof e === "string" && e.trim() !== "" ? e.trim().toLowerCase() : null;
  const strictlyEmailsThisRequest = [
    norm(data.strictly_lead_email),
    norm(data.strictly_follow_email),
  ].filter((e): e is string => e !== null);
  const jnjEmailsThisRequest = [
    norm(data.jnj_lead_email),
    norm(data.jnj_follow_email),
  ].filter((e): e is string => e !== null);

  if (strictlyEmailsThisRequest.length > 0 || jnjEmailsThisRequest.length > 0) {
    const { data: existingSignups } = await supabaseServer
      .from("comp_signups")
      .select("strictly_selected, strictly_lead_email, strictly_follow_email, jnj_selected, jnj_lead_email, jnj_follow_email")
      .eq("event_id", eventId);

    const existingStrictlyEmails = new Set<string>();
    const existingJnJEmails = new Set<string>();
    for (const row of existingSignups ?? []) {
      const r = row as Record<string, string | null | boolean>;
      if (r.strictly_selected) {
        const a = norm(r.strictly_lead_email);
        const b = norm(r.strictly_follow_email);
        if (a) existingStrictlyEmails.add(a);
        if (b) existingStrictlyEmails.add(b);
      }
      if (r.jnj_selected) {
        const a = norm(r.jnj_lead_email);
        const b = norm(r.jnj_follow_email);
        if (a) existingJnJEmails.add(a);
        if (b) existingJnJEmails.add(b);
      }
    }

    const duplicateStrictly = strictlyEmailsThisRequest.some((e) => existingStrictlyEmails.has(e));
    const duplicateJnJ = jnjEmailsThisRequest.some((e) => existingJnJEmails.has(e));
    if (duplicateStrictly || duplicateJnJ) {
      const eventDate = event.starts_at ? formatEventDateInChicago(event.starts_at) : "";
      return NextResponse.json(
        {
          error: "Already registered",
          alreadyRegistered: true,
          eventTitle,
          eventDate,
        },
        { status: 409 }
      );
    }
  }

  const effectivePayment =
    paymentMethod.toLowerCase() === "cash" ? "Cash" : "Stripe";

  const insertRow: Record<string, unknown> = {
    event_id: eventId,
    event_title: eventTitle,
    strictly_selected: strictlySelected,
    strictly_price: data.strictly_price ?? null,
    strictly_lead_first_name: data.strictly_lead_first_name ?? null,
    strictly_lead_last_name: data.strictly_lead_last_name ?? null,
    strictly_lead_email: data.strictly_lead_email ?? null,
    strictly_follow_first_name: data.strictly_follow_first_name ?? null,
    strictly_follow_last_name: data.strictly_follow_last_name ?? null,
    strictly_follow_email: data.strictly_follow_email ?? null,
    jnj_selected: jnjSelected,
    jnj_price: data.jnj_price ?? null,
    jnj_lead_first_name: data.jnj_lead_first_name ?? null,
    jnj_lead_last_name: data.jnj_lead_last_name ?? null,
    jnj_lead_email: data.jnj_lead_email ?? null,
    jnj_follow_first_name: data.jnj_follow_first_name ?? null,
    jnj_follow_last_name: data.jnj_follow_last_name ?? null,
    jnj_follow_email: data.jnj_follow_email ?? null,
    payment_method: effectivePayment,
    amount_owed: amountOwed,
    paid: false, // Only Stripe checkout sets paid: true (via webhook or below for $0)
    accept_liability: acceptLiability,
    accept_payment: acceptPayment,
  };

  // Stripe path: do NOT create record here; webhook creates it when payment completes (same as event stripe_checkout)
  if (effectivePayment === "Stripe" && amountOwed > 0.5) {
    const processingFee = roundCurrency(calculateProcessingFee(amountOwed));
    const compSignupId = randomUUID();
    const base = getBaseUrl(req);
    const lineItems: any[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: eventTitle + " — Comp registration",
            description: `Comp signup (Strictly${strictlySelected ? " + " : ""}${jnjSelected ? "JnJ" : ""})`,
            tax_code: getEventTaxCode(),
          },
          unit_amount: Math.round(amountOwed * 100),
        },
        quantity: 1,
      },
    ];
    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Processing Fee",
            description: "Payment processing fee",
            tax_code: getProcessingFeeTaxCode(),
          },
          unit_amount: Math.round(processingFee * 100),
        },
        quantity: 1,
      });
    }

    const customerEmail =
      data.strictly_lead_email || data.strictly_follow_email || data.jnj_lead_email || data.jnj_follow_email;
    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        automatic_tax: { enabled: true },
        allow_promotion_codes: true,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        client_reference_id: compSignupId,
        metadata: {
          payment_type: "comp_signup",
          comp_signup_id: compSignupId,
          event_id: String(eventId),
          event_title: eventTitle,
          subtotal: String(amountOwed),
          processing_fee: String(processingFee),
          strictly_selected: String(strictlySelected),
          strictly_price: data.strictly_price != null ? String(data.strictly_price) : "",
          strictly_lead_first_name: (data.strictly_lead_first_name ?? "") as string,
          strictly_lead_last_name: (data.strictly_lead_last_name ?? "") as string,
          strictly_lead_email: (data.strictly_lead_email ?? "") as string,
          strictly_follow_first_name: (data.strictly_follow_first_name ?? "") as string,
          strictly_follow_last_name: (data.strictly_follow_last_name ?? "") as string,
          strictly_follow_email: (data.strictly_follow_email ?? "") as string,
          jnj_selected: String(jnjSelected),
          jnj_price: data.jnj_price != null ? String(data.jnj_price) : "",
          jnj_lead_first_name: (data.jnj_lead_first_name ?? "") as string,
          jnj_lead_last_name: (data.jnj_lead_last_name ?? "") as string,
          jnj_lead_email: (data.jnj_lead_email ?? "") as string,
          jnj_follow_first_name: (data.jnj_follow_first_name ?? "") as string,
          jnj_follow_last_name: (data.jnj_follow_last_name ?? "") as string,
          jnj_follow_email: (data.jnj_follow_email ?? "") as string,
          amount_owed: String(amountOwed),
          accept_liability: String(acceptLiability),
          accept_payment: String(acceptPayment),
        },
        success_url: `${base}/events/comp-confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/events?payment=cancelled`,
      });
      return NextResponse.json({ success: true, redirect: session.url! });
    } catch (stripeErr: any) {
      console.error("Stripe error:", stripeErr);
      return NextResponse.json(
        { error: "Failed to create Stripe session", details: stripeErr?.message },
        { status: 500 }
      );
    }
  }

  // Cash or Stripe with $0: insert and send email
  if (effectivePayment === "Stripe" && amountOwed <= 0.5) {
    insertRow.paid = true;
    insertRow.amount_owed = 0;
  }

  const { data: inserted, error: insertError } = await supabaseServer
    .from("comp_signups")
    .insert([insertRow])
    .select("id")
    .single();

  if (insertError) {
    console.error("comp-signup insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to save comp signup", details: insertError.message },
      { status: 500 }
    );
  }

  const base = getBaseUrl(req);
  const paymentLink = `${base}/events/comp-pay/${inserted.id}`;
  const primaryEmail =
    strictlySelected && data.strictly_lead_email
      ? data.strictly_lead_email
      : jnjSelected && data.jnj_lead_email
        ? data.jnj_lead_email
        : strictlySelected && data.strictly_follow_email
          ? data.strictly_follow_email
          : data.jnj_follow_email;

  const paymentSection =
    effectivePayment === "Cash" && amountOwed > 0
      ? `
      <div style="background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> Cash.</p>
        <p style="margin: 10px 0 0 0;"><strong>Amount due:</strong> $${amountOwed.toFixed(2)}</p>
        <p style="margin: 10px 0 0 0;">Pay at the door or use the link below to pay online:</p>
        <p style="margin: 10px 0 0 0;">
          <a href="${paymentLink}" style="display: inline-block; background-color: #F2C94C; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">Pay Online via Stripe</a>
        </p>
      </div>
    `
      : amountOwed <= 0.5
        ? `
      <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;">No payment required.</p>
      </div>
    `
        : "";

  const compQrPayload = compSignupToken(inserted.id);
  const { contentId: qrContentId, attachments: qrAttachments } = await makeQrCodeInlineAttachment(compQrPayload);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 20px; }
          .details-box { background-color: white; border: 2px solid #f2c94c; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-row:last-child { border-bottom: none; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Country City Swing</h1>
            <h2>Comp Registration Confirmation</h2>
          </div>
          <div class="content">
            <p>Your How's My Dancing comp registration has been received.</p>
            <div class="details-box">
              <h3 style="margin-top: 0; color: #f2c94c;">${eventTitle}</h3>
              <div class="detail-row"><strong>Amount due:</strong> $${amountOwed.toFixed(2)}</div>
              <div class="detail-row"><strong>Payment method:</strong> ${effectivePayment}</div>
            </div>
            ${paymentSection}
            <div style="text-align: center; margin: 20px 0; padding: 15px; background: #fff; border-radius: 8px; border: 2px solid #f2c94c;">
              <p style="margin: 0 0 10px 0; font-size: 0.95em; color: #666;"><strong>Check-in at the event</strong></p>
              <p style="margin: 0 0 12px 0; font-size: 0.85em; color: #888;">Show this QR code at the door for quick check-in.</p>
              <img src="cid:${qrContentId}" alt="Check-in QR code" width="160" height="160" style="display: block; margin: 0 auto;" />
            </div>
            <p>Questions? Contact us at contact.us@countrycityswing.dance</p>
          </div>
          <div class="footer">Country City Swing — Nashville, TN</div>
        </div>
      </body>
    </html>`;

  try {
    if (primaryEmail) {
      await sendHtmlEmail(
        primaryEmail,
        `Comp signup — ${eventTitle}`,
        html,
        "confirmation@countrycityswing.dance",
        undefined,
        qrAttachments
      );
    }
  } catch (err) {
    console.error("Comp signup email error:", err);
  }

  if (effectivePayment === "Stripe" && amountOwed <= 0.5) {
    return NextResponse.json({
      success: true,
      noRedirect: true,
      message: "No payment required. You're all set!",
    });
  }
  return NextResponse.json({ success: true });
}
