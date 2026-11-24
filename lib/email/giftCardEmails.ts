const BRAND = "#f2c94c";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createGiftCardBuyerEmailHtml(args: {
  amount: number;
  purchasedForSelf: boolean;
  recipientName?: string | null;
  recipientEmail?: string | null;
  deliverAtLabel?: string | null;
  code?: string | null;
}): string {
  const amountStr = `$${args.amount.toFixed(2)}`;
  const codeBlock = args.code
    ? `<div class="detail-row"><strong>Your code:</strong> <code style="font-size:1.1em;">${escapeHtml(args.code)}</code></div>`
    : "";
  const recipientLine =
    args.purchasedForSelf
      ? "<p>This gift card is for you.</p>"
      : `<p>Gift for ${escapeHtml(args.recipientName || "your recipient")} (${escapeHtml(args.recipientEmail || "")}).</p>
         <p>The recipient will receive the gift card code by email ${args.deliverAtLabel ? `on ${escapeHtml(args.deliverAtLabel)}` : "when scheduled"}.</p>`;

  return `<!DOCTYPE html><html><head><style>
    body{font-family:Arial,sans-serif;line-height:1.6;color:#333;}
    .container{max-width:600px;margin:0 auto;padding:20px;}
    .header{background-color:${BRAND};color:#000;padding:20px;text-align:center;}
    .content{background:#f9f9f9;padding:20px;}
    .details-box{background:#fff;border:2px solid ${BRAND};border-radius:8px;padding:20px;margin:20px 0;}
    .detail-row{padding:10px 0;border-bottom:1px solid #eee;}
  </style></head><body><div class="container">
    <div class="header"><h1>Country City Swing</h1><h2>Gift card confirmed</h2></div>
    <div class="content">
      <p>Thank you for your purchase.</p>
      ${recipientLine}
      <div class="details-box">
        <div class="detail-row"><strong>Amount:</strong> ${amountStr}</div>
        ${deliverAtLine(args.deliverAtLabel, args.purchasedForSelf)}
        ${codeBlock}
      </div>
      <p>Redeem your gift card at checkout anywhere on countrycityswing.dance.</p>
    </div>
  </div></body></html>`;
}

function deliverAtLine(
  deliverAtLabel: string | null | undefined,
  purchasedForSelf: boolean
): string {
  if (!deliverAtLabel || purchasedForSelf) return "";
  return `<div class="detail-row"><strong>Recipient delivery:</strong> ${escapeHtml(deliverAtLabel)}</div>`;
}

export function createGiftCardRecipientEmailHtml(args: {
  amount: number;
  code: string;
  personalMessage?: string | null;
  recipientName?: string | null;
  buyerName?: string | null;
}): string {
  const msg = args.personalMessage?.trim()
    ? `<div style="background:#fff;border-left:4px solid ${BRAND};padding:15px;margin:20px 0;font-style:italic;">
         ${escapeHtml(args.personalMessage.trim())}
       </div>`
    : "";

  const greeting = args.recipientName
    ? `Hi ${escapeHtml(args.recipientName)},`
    : "Hello,";

  return `<!DOCTYPE html><html><head><style>
    body{font-family:Arial,sans-serif;line-height:1.6;color:#333;}
    .container{max-width:600px;margin:0 auto;padding:20px;}
    .header{background-color:${BRAND};color:#000;padding:20px;text-align:center;}
    .content{background:#f9f9f9;padding:20px;}
    .code-box{text-align:center;font-size:1.4em;font-weight:bold;letter-spacing:2px;padding:20px;background:#fff;border:2px solid ${BRAND};border-radius:8px;margin:20px 0;}
  </style></head><body><div class="container">
    <div class="header"><h1>You received a gift card</h1></div>
    <div class="content">
      <p>${greeting}</p>
      <p>${args.buyerName ? escapeHtml(args.buyerName) + " sent you" : "Someone sent you"} a Country City Swing gift card worth <strong>$${args.amount.toFixed(2)}</strong>.</p>
      ${msg}
      <p>Your gift card code:</p>
      <div class="code-box">${escapeHtml(args.code)}</div>
      <p>Use this code at checkout on countrycityswing.dance for classes, events, merch, and more.</p>
    </div>
  </div></body></html>`;
}