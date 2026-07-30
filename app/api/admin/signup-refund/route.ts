import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { requireFinanceAuth } from "@/lib/financeAuth";
import { sendHtmlEmail } from "@/lib/mailer";
import { roundCurrency } from "@/lib/utils/paymentHelpers";
import {
  computePartialStripeRefund,
  sumPriorRefunds,
  type RefundBreakdownPrior,
} from "@/lib/utils/signupRefundAmounts";

type RefundMode = "full" | "partial" | "cancel_unpaid";

function dollarsFromCents(cents: number): number {
  return roundCurrency(cents / 100);
}

function isStripeMethod(pm: string | null | undefined): boolean {
  return (pm || "").trim().toLowerCase() === "stripe";
}

function isVoucherMethod(pm: string | null | undefined): boolean {
  return (pm || "").trim().toLowerCase() === "class voucher";
}

function isCashMethod(pm: string | null | undefined): boolean {
  const p = (pm || "").trim().toLowerCase();
  return p === "cash" || p === "ccs team";
}

async function loadSignupRow(signupId: string, isComp: boolean) {
  if (isComp) {
    return supabaseServer
      .from("comp_signups")
      .select(
        "id,event_id,event_title,payment_method,paid,amount_owed,stripe_tax_amount,stripe_processing_fee,stripe_total_paid,stripe_session_id,stripe_payment_intent_id,refunded_or_cancelled,strictly_lead_first_name,strictly_lead_last_name,strictly_lead_email,strictly_follow_email,jnj_lead_first_name,jnj_lead_last_name,jnj_lead_email,jnj_follow_email"
      )
      .eq("id", signupId)
      .single();
  }
  return supabaseServer
    .from("signups")
    .select(
      "id,event_id,event_title,first_name,last_name,email,payment_method,paid,amount_owed,amount_paid,stripe_tax_amount,stripe_processing_fee,stripe_total_paid,stripe_session_id,stripe_payment_intent_id,refunded_or_cancelled,free_via_promotion_code,used_promotion_code"
    )
    .eq("id", signupId)
    .single();
}

async function loadPriors(signupId: string, isComp: boolean): Promise<RefundBreakdownPrior[]> {
  const col = isComp ? "comp_signup_id" : "signup_id";
  const { data, error } = await supabaseServer
    .from("signup_refunds")
    .select("principal_refunded,fee_refunded,tax_refunded,amount_refunded")
    .eq(col, String(signupId));
  if (error) {
    console.error("signup-refund: load priors", error);
    return [];
  }
  return (data ?? []) as RefundBreakdownPrior[];
}

function remainingRefundableCents(pi: {
  amount?: number | null;
  amount_received?: number | null;
  amount_refunded?: number | null;
}): number {
  const amount = pi.amount_received ?? pi.amount ?? 0;
  const refunded = pi.amount_refunded ?? 0;
  return Math.max(0, amount - refunded);
}

async function insertRefundRow(row: Record<string, unknown>) {
  const { error } = await supabaseServer.from("signup_refunds").insert([row]);
  if (error) {
    console.error("signup-refund: insert audit", error);
    throw new Error(error.message);
  }
}

async function updateSignupStatus(
  table: "signups" | "comp_signups",
  id: string,
  status: "partial" | "cancelled"
) {
  const { error } = await supabaseServer
    .from(table)
    .update({
      refunded_or_cancelled: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

function refundEmailHtml(opts: {
  name: string;
  eventTitle: string;
  mode: RefundMode | "sync";
  amount: number;
  cancelled: boolean;
}): string {
  const amountLine =
    opts.amount > 0
      ? `<p>Amount refunded: <strong>$${opts.amount.toFixed(2)}</strong></p>`
      : `<p>No payment was collected for this registration.</p>`;
  const statusLine = opts.cancelled
    ? `<p>Your registration for <strong>${opts.eventTitle}</strong> has been <strong>cancelled</strong>.</p>`
    : `<p>A partial refund was issued for <strong>${opts.eventTitle}</strong>. Your registration remains active.</p>`;
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
      <p>Hi ${opts.name || "there"},</p>
      ${statusLine}
      ${amountLine}
      <p>If you have questions, reply to this email or contact us at contact.us@countrycityswing.dance.</p>
      <p>— Country City Swing</p>
    </div>
  `;
}

async function sendRefundEmails(opts: {
  emails: string[];
  name: string;
  eventTitle: string;
  mode: RefundMode;
  amount: number;
  cancelled: boolean;
}) {
  const unique = [...new Set(opts.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  for (const to of unique) {
    try {
      await sendHtmlEmail(
        to,
        opts.cancelled
          ? `Registration cancelled — ${opts.eventTitle}`
          : `Refund issued — ${opts.eventTitle}`,
        refundEmailHtml({
          name: opts.name,
          eventTitle: opts.eventTitle,
          mode: opts.mode,
          amount: opts.amount,
          cancelled: opts.cancelled,
        }),
        "confirmation@countrycityswing.dance"
      );
    } catch (e) {
      console.error("signup-refund: email failed", to, e);
    }
  }
}

function compEmails(comp: Record<string, unknown>): string[] {
  const leads = [
    comp.strictly_lead_email,
    comp.jnj_lead_email,
    comp.strictly_follow_email,
    comp.jnj_follow_email,
  ]
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter(Boolean);
  // Prefer first lead if present; if unknown which signed up, email both leads
  const primary = [comp.strictly_lead_email, comp.jnj_lead_email]
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter(Boolean);
  if (primary.length === 1) return primary;
  if (primary.length > 1) return primary;
  return leads;
}

function compName(comp: Record<string, unknown>): string {
  const parts = [
    [comp.strictly_lead_first_name, comp.strictly_lead_last_name],
    [comp.jnj_lead_first_name, comp.jnj_lead_last_name],
  ];
  for (const p of parts) {
    const n = p.filter((x) => typeof x === "string" && x).join(" ").trim();
    if (n) return n;
  }
  return "dancer";
}

/** Sync DB status from Stripe PaymentIntent if Dashboard refunds happened. */
async function syncFromStripePaymentIntent(opts: {
  table: "signups" | "comp_signups";
  id: string;
  isComp: boolean;
  eventId: string;
  eventTitle: string;
  paymentMethod: string | null;
  paymentIntentId: string;
  email: string | null;
  name: string;
  currentStatus: string;
  adminEmail: string | null;
}): Promise<{ status: string; remainingCents: number; synced: boolean }> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(opts.paymentIntentId);
  const piAmounts = pi as {
    amount?: number | null;
    amount_received?: number | null;
    amount_refunded?: number | null;
  };
  const remaining = remainingRefundableCents(piAmounts);
  const amount = piAmounts.amount_received ?? piAmounts.amount ?? 0;
  const refunded = piAmounts.amount_refunded ?? 0;
  let status = opts.currentStatus || "active";
  let synced = false;

  if (amount > 0 && refunded >= amount && status !== "cancelled") {
    await updateSignupStatus(opts.table, opts.id, "cancelled");
    await insertRefundRow({
      event_id: opts.eventId,
      event_title: opts.eventTitle,
      signup_id: opts.isComp ? null : String(opts.id),
      comp_signup_id: opts.isComp ? String(opts.id) : null,
      is_comp: opts.isComp,
      payment_method: opts.paymentMethod,
      mode: "full",
      amount_refunded: dollarsFromCents(refunded),
      principal_refunded: dollarsFromCents(refunded),
      fee_refunded: 0,
      tax_refunded: 0,
      stripe_payment_intent_id: opts.paymentIntentId,
      stripe_refund_id: null,
      refunded_or_cancelled_result: "cancelled",
      refunded_by_email: opts.adminEmail,
      note: "Synced from Stripe (already fully refunded)",
      signup_email: opts.email,
      signup_name: opts.name,
    });
    status = "cancelled";
    synced = true;
  } else if (refunded > 0 && remaining > 0 && status === "active") {
    await updateSignupStatus(opts.table, opts.id, "partial");
    await insertRefundRow({
      event_id: opts.eventId,
      event_title: opts.eventTitle,
      signup_id: opts.isComp ? null : String(opts.id),
      comp_signup_id: opts.isComp ? String(opts.id) : null,
      is_comp: opts.isComp,
      payment_method: opts.paymentMethod,
      mode: "partial",
      amount_refunded: dollarsFromCents(refunded),
      principal_refunded: dollarsFromCents(refunded),
      fee_refunded: 0,
      tax_refunded: 0,
      stripe_payment_intent_id: opts.paymentIntentId,
      stripe_refund_id: null,
      refunded_or_cancelled_result: "partial",
      refunded_by_email: opts.adminEmail,
      note: "Synced from Stripe (partial refund detected)",
      signup_email: opts.email,
      signup_name: opts.name,
    });
    status = "partial";
    synced = true;
  }

  return { status, remainingCents: remaining, synced };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const signupId = req.nextUrl.searchParams.get("signupId");
    const isComp = req.nextUrl.searchParams.get("isComp") === "true";
    if (!signupId) {
      return NextResponse.json({ error: "signupId is required" }, { status: 400 });
    }

    const table = isComp ? "comp_signups" : "signups";
    const { data: row, error } = await loadSignupRow(signupId, isComp);

    if (error || !row) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }

    const r = row as Record<string, unknown>;
    let status = String(r.refunded_or_cancelled || "active");
    let remainingCents = 0;
    let synced = false;
    const piId =
      typeof r.stripe_payment_intent_id === "string" ? r.stripe_payment_intent_id : null;

    const name = isComp
      ? compName(r)
      : `${r.first_name || ""} ${r.last_name || ""}`.trim();
    const email = isComp
      ? compEmails(r)[0] || null
      : typeof r.email === "string"
        ? r.email
        : null;

    if (piId && status !== "cancelled") {
      const sync = await syncFromStripePaymentIntent({
        table,
        id: String(signupId),
        isComp,
        eventId: String(r.event_id),
        eventTitle: String(r.event_title || ""),
        paymentMethod: (r.payment_method as string) || null,
        paymentIntentId: piId,
        email,
        name,
        currentStatus: status,
        adminEmail: null,
      });
      status = sync.status;
      remainingCents = sync.remainingCents;
      synced = sync.synced;
    } else if (piId) {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(piId);
      remainingCents = remainingRefundableCents(
        pi as {
          amount?: number | null;
          amount_received?: number | null;
          amount_refunded?: number | null;
        }
      );
    }

    const priors = await loadPriors(String(signupId), isComp);
    const priorSums = sumPriorRefunds(priors);
    const principalPaid = isComp
      ? Number(r.amount_owed ?? 0)
      : Number(
          r.amount_paid != null ? r.amount_paid : r.amount_owed != null ? r.amount_owed : 0
        );

    return NextResponse.json({
      signup: { ...r, refunded_or_cancelled: status },
      isComp,
      synced,
      paymentIntentRemainingCents: remainingCents,
      priorRefunds: priors,
      priorSums,
      principalPaid,
      remainingPrincipal: roundCurrency(Math.max(0, principalPaid - priorSums.principal)),
    });
  } catch (e) {
    console.error("GET signup-refund", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFinanceAuth(req, { requireAdmin: true });
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const signupId = body.signupId != null ? String(body.signupId) : "";
    const isComp = body.isComp === true;
    const mode = body.mode as RefundMode;
    if (!signupId || !["full", "partial", "cancel_unpaid"].includes(mode)) {
      return NextResponse.json(
        { error: "signupId and mode (full|partial|cancel_unpaid) are required" },
        { status: 400 }
      );
    }

    const table = isComp ? "comp_signups" : "signups";
    const { data: row, error } = await loadSignupRow(signupId, isComp);

    if (error || !row) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }

    const r = row as Record<string, unknown>;
    if (String(r.refunded_or_cancelled || "active") === "cancelled") {
      return NextResponse.json({ error: "Signup is already cancelled." }, { status: 400 });
    }

    let refundedByEmail: string | null = null;
    try {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("email")
        .eq("id", auth.access.userId)
        .maybeSingle();
      refundedByEmail = profile?.email ?? null;
    } catch {
      /* ignore */
    }

    const name = isComp
      ? compName(r)
      : `${r.first_name || ""} ${r.last_name || ""}`.trim();
    const emails = isComp
      ? compEmails(r)
      : typeof r.email === "string" && r.email.trim()
        ? [r.email.trim()]
        : [];
    const eventTitle = String(r.event_title || "Event");
    const eventId = String(r.event_id);
    const pm = (r.payment_method as string) || null;
    const paid = r.paid === true;
    const freeViaPromo = r.free_via_promotion_code === true;
    const piId =
      typeof r.stripe_payment_intent_id === "string" ? r.stripe_payment_intent_id : null;
    const principalPaid = isComp
      ? Number(r.amount_owed ?? 0)
      : Number(
          r.amount_paid != null ? r.amount_paid : r.amount_owed != null ? r.amount_owed : 0
        );

    // --- Unpaid / full voucher / free promo cancel ---
    const noMoneyCollected =
      !paid ||
      freeViaPromo ||
      principalPaid <= 0 ||
      (isVoucherMethod(pm) && !piId && !isCashMethod(pm));

    if (mode === "cancel_unpaid" || (mode === "full" && noMoneyCollected && !piId)) {
      await updateSignupStatus(table, signupId, "cancelled");
      await insertRefundRow({
        event_id: eventId,
        event_title: eventTitle,
        signup_id: isComp ? null : signupId,
        comp_signup_id: isComp ? signupId : null,
        is_comp: isComp,
        payment_method: pm,
        mode: "cancel_unpaid",
        amount_refunded: 0,
        principal_refunded: 0,
        fee_refunded: 0,
        tax_refunded: 0,
        refunded_or_cancelled_result: "cancelled",
        refunded_by_email: refundedByEmail,
        note:
          typeof body.note === "string"
            ? body.note
            : isVoucherMethod(pm)
              ? "Cancelled; class voucher not refunded"
              : "Cancelled; nothing paid",
        signup_email: emails[0] || null,
        signup_name: name,
      });
      await sendRefundEmails({
        emails,
        name,
        eventTitle,
        mode: "cancel_unpaid",
        amount: 0,
        cancelled: true,
      });
      return NextResponse.json({ success: true, status: "cancelled", amountRefunded: 0 });
    }

    // --- Stripe paths ---
    if (isStripeMethod(pm) || piId) {
      if (!piId) {
        return NextResponse.json(
          {
            error:
              "Missing Stripe payment intent. Run signup Stripe ID backfill or refund in the Stripe Dashboard.",
          },
          { status: 400 }
        );
      }

      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(piId);
      let remainingCents = remainingRefundableCents(
        pi as {
          amount?: number | null;
          amount_received?: number | null;
          amount_refunded?: number | null;
        }
      );

      if (remainingCents <= 0) {
        await updateSignupStatus(table, signupId, "cancelled");
        return NextResponse.json({
          success: true,
          status: "cancelled",
          amountRefunded: 0,
          message: "PaymentIntent already fully refunded; status set to cancelled.",
        });
      }

      const priors = await loadPriors(signupId, isComp);
      let amountCents = remainingCents;
      let principal = 0;
      let fee = 0;
      let tax = 0;
      let resultStatus: "partial" | "cancelled" = "cancelled";
      let auditMode: RefundMode = mode === "partial" ? "partial" : "full";

      if (mode === "partial" && body.refundRemaining !== true) {
        const principalRefund = roundCurrency(
          body.principalAmount != null
            ? Number(body.principalAmount)
            : body.principalAmountCents != null
              ? Number(body.principalAmountCents) / 100
              : NaN
        );
        const computed = computePartialStripeRefund({
          principalRefund,
          principalPaid,
          stripeProcessingFee:
            r.stripe_processing_fee != null ? Number(r.stripe_processing_fee) : null,
          stripeTaxAmount: r.stripe_tax_amount != null ? Number(r.stripe_tax_amount) : null,
          priorRefunds: priors,
          paymentIntentRemainingCents: remainingCents,
        });
        if (!computed.ok) {
          return NextResponse.json({ error: computed.error }, { status: 400 });
        }
        amountCents = computed.totalCents;
        principal = computed.principal;
        fee = computed.fee;
        tax = computed.tax;
        if (computed.treatsAsFull) {
          resultStatus = "cancelled";
          auditMode = "full";
          amountCents = remainingCents;
        } else {
          resultStatus = "partial";
        }
      } else {
        // full or refundRemaining
        amountCents = remainingCents;
        principal = dollarsFromCents(remainingCents);
        fee = 0;
        tax = 0;
        resultStatus = "cancelled";
        auditMode = "full";
      }

      const stableKey = `signup-refund:${isComp ? "c" : "s"}:${signupId}:${auditMode}:${amountCents}:p${priors.length}`;

      const refund = await stripe.refunds.create(
        {
          payment_intent: piId,
          amount: amountCents,
        },
        { idempotencyKey: stableKey }
      );

      const amountRefunded = dollarsFromCents(refund.amount ?? amountCents);
      await updateSignupStatus(table, signupId, resultStatus);
      await insertRefundRow({
        event_id: eventId,
        event_title: eventTitle,
        signup_id: isComp ? null : signupId,
        comp_signup_id: isComp ? signupId : null,
        is_comp: isComp,
        payment_method: pm || "Stripe",
        mode: auditMode,
        amount_refunded: amountRefunded,
        principal_refunded: auditMode === "full" ? amountRefunded : principal,
        fee_refunded: auditMode === "full" ? 0 : fee,
        tax_refunded: auditMode === "full" ? 0 : tax,
        stripe_payment_intent_id: piId,
        stripe_refund_id: refund.id,
        refunded_or_cancelled_result: resultStatus,
        refunded_by_email: refundedByEmail,
        note: typeof body.note === "string" ? body.note : null,
        signup_email: emails[0] || null,
        signup_name: name,
      });

      await sendRefundEmails({
        emails,
        name,
        eventTitle,
        mode: auditMode,
        amount: amountRefunded,
        cancelled: resultStatus === "cancelled",
      });

      return NextResponse.json({
        success: true,
        status: resultStatus,
        amountRefunded,
        stripeRefundId: refund.id,
      });
    }

    // --- Cash (and non-Stripe paid) ---
    if (paid && (isCashMethod(pm) || (!isStripeMethod(pm) && !isVoucherMethod(pm)))) {
      const amountRefunded = roundCurrency(Number(body.amountRefunded ?? 0));
      if (mode === "partial" && !(amountRefunded > 0)) {
        return NextResponse.json(
          { error: "amountRefunded is required for cash partial refunds." },
          { status: 400 }
        );
      }
      const fullCash =
        mode === "full" || amountRefunded >= principalPaid - 0.001 || principalPaid <= 0;
      const resultStatus: "partial" | "cancelled" = fullCash ? "cancelled" : "partial";
      const recorded = fullCash
        ? mode === "full"
          ? principalPaid
          : amountRefunded
        : amountRefunded;

      await updateSignupStatus(table, signupId, resultStatus);
      await insertRefundRow({
        event_id: eventId,
        event_title: eventTitle,
        signup_id: isComp ? null : signupId,
        comp_signup_id: isComp ? signupId : null,
        is_comp: isComp,
        payment_method: pm,
        mode: fullCash ? "full" : "partial",
        amount_refunded: recorded,
        principal_refunded: recorded,
        fee_refunded: 0,
        tax_refunded: 0,
        refunded_or_cancelled_result: resultStatus,
        refunded_by_email: refundedByEmail,
        note: typeof body.note === "string" ? body.note : "Cash refund recorded",
        signup_email: emails[0] || null,
        signup_name: name,
      });

      await sendRefundEmails({
        emails,
        name,
        eventTitle,
        mode: fullCash ? "full" : "partial",
        amount: recorded,
        cancelled: resultStatus === "cancelled",
      });

      return NextResponse.json({
        success: true,
        status: resultStatus,
        amountRefunded: recorded,
      });
    }

    // Voucher-only paid → cancel without money
    if (isVoucherMethod(pm)) {
      await updateSignupStatus(table, signupId, "cancelled");
      await insertRefundRow({
        event_id: eventId,
        event_title: eventTitle,
        signup_id: isComp ? null : signupId,
        comp_signup_id: isComp ? signupId : null,
        is_comp: isComp,
        payment_method: pm,
        mode: "cancel_unpaid",
        amount_refunded: 0,
        principal_refunded: 0,
        fee_refunded: 0,
        tax_refunded: 0,
        refunded_or_cancelled_result: "cancelled",
        refunded_by_email: refundedByEmail,
        note: "Cancelled; class voucher not refunded",
        signup_email: emails[0] || null,
        signup_name: name,
      });
      await sendRefundEmails({
        emails,
        name,
        eventTitle,
        mode: "cancel_unpaid",
        amount: 0,
        cancelled: true,
      });
      return NextResponse.json({ success: true, status: "cancelled", amountRefunded: 0 });
    }

    return NextResponse.json(
      { error: "Unable to determine refund path for this signup." },
      { status: 400 }
    );
  } catch (e) {
    console.error("POST signup-refund", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
