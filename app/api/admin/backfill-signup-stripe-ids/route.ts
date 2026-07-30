import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { requireFinanceAuth } from "@/lib/financeAuth";
import {
  isSignupPaymentType,
  matchSessionsToSignups,
  type BackfillSessionInfo,
  type BackfillSignupCandidate,
} from "@/lib/utils/backfillSignupStripeIds";

/** PostgREST/Supabase default max rows is 1000 — page explicitly past that. */
const PAGE_SIZE = 1000;

type SignupCandidateRow = {
  id: string | number;
  event_id: string;
  email: string | null;
  created_at: string;
};

type CompCandidateRow = {
  id: string | number;
  event_id: string;
  created_at: string;
  strictly_lead_email: string | null;
  jnj_lead_email: string | null;
};

type ClaimedIdRow = {
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { data: out, error: error.message };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: out, error: null };
}

function paymentIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi) return pi;
  if (pi && typeof pi === "object" && "id" in pi && typeof pi.id === "string") return pi.id;
  return null;
}

function toSessionInfo(session: Stripe.Checkout.Session): BackfillSessionInfo | null {
  const paymentType = session.metadata?.payment_type ?? null;
  if (!isSignupPaymentType(paymentType)) return null;
  return {
    id: session.id,
    payment_intent_id: paymentIntentIdFromSession(session),
    created: session.created,
    payment_type: paymentType,
    signup_id: session.metadata?.signup_id ?? null,
    comp_signup_id: session.metadata?.comp_signup_id ?? null,
    client_reference_id: session.client_reference_id ?? null,
    email: session.metadata?.email ?? session.customer_email ?? null,
    event_id: session.metadata?.event_id ?? null,
  };
}

async function listSignupCheckoutSessions(): Promise<BackfillSessionInfo[]> {
  const stripe = getStripe();
  const out: BackfillSessionInfo[] = [];
  let startingAfter: string | undefined;
  // Cap pages high enough for full history (100 * 100 = 10k sessions).
  for (let page = 0; page < 200; page++) {
    const list = await stripe.checkout.sessions.list({
      limit: 100,
      status: "complete",
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const session of list.data) {
      const info = toSessionInfo(session);
      if (info) out.push(info);
    }
    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return out;
}

async function loadMissingSignupCandidates(): Promise<{
  data: BackfillSignupCandidate[];
  error: string | null;
  signupCount: number;
  compCount: number;
}> {
  const signupsResult = await fetchAllPages<SignupCandidateRow>(async (from, to) => {
    const { data, error } = await supabaseServer
      .from("signups")
      .select("id,event_id,email,created_at")
      .eq("paid", true)
      .ilike("payment_method", "stripe")
      .is("stripe_session_id", null)
      .order("id", { ascending: true })
      .range(from, to);
    return {
      data: (data as SignupCandidateRow[] | null) ?? null,
      error: error ? { message: error.message } : null,
    };
  });

  if (signupsResult.error) {
    return { data: [], error: signupsResult.error, signupCount: 0, compCount: 0 };
  }

  const compsResult = await fetchAllPages<CompCandidateRow>(async (from, to) => {
    const { data, error } = await supabaseServer
      .from("comp_signups")
      .select("id,event_id,created_at,strictly_lead_email,jnj_lead_email")
      .eq("paid", true)
      .ilike("payment_method", "stripe")
      .is("stripe_session_id", null)
      .order("id", { ascending: true })
      .range(from, to);
    return {
      data: (data as CompCandidateRow[] | null) ?? null,
      error: error ? { message: error.message } : null,
    };
  });

  if (compsResult.error) {
    return { data: [], error: compsResult.error, signupCount: 0, compCount: 0 };
  }

  const candidates: BackfillSignupCandidate[] = [
    ...signupsResult.data.map((s) => ({
      id: String(s.id),
      event_id: String(s.event_id),
      email: s.email ?? null,
      created_at: s.created_at,
      is_comp: false,
    })),
    ...compsResult.data.map((c) => ({
      id: String(c.id),
      event_id: String(c.event_id),
      email: c.strictly_lead_email || c.jnj_lead_email || null,
      created_at: c.created_at,
      is_comp: true,
    })),
  ];

  return {
    data: candidates,
    error: null,
    signupCount: signupsResult.data.length,
    compCount: compsResult.data.length,
  };
}

async function loadClaimedStripeIds(): Promise<{
  sessions: Set<string>;
  paymentIntents: Set<string>;
  error: string | null;
}> {
  const claimedSessions = new Set<string>();
  const claimedPis = new Set<string>();

  const signupsResult = await fetchAllPages<ClaimedIdRow>(async (from, to) => {
    const { data, error } = await supabaseServer
      .from("signups")
      .select("stripe_session_id,stripe_payment_intent_id")
      .not("stripe_session_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to);
    return {
      data: (data as ClaimedIdRow[] | null) ?? null,
      error: error ? { message: error.message } : null,
    };
  });
  if (signupsResult.error) {
    return { sessions: claimedSessions, paymentIntents: claimedPis, error: signupsResult.error };
  }

  const compsResult = await fetchAllPages<ClaimedIdRow>(async (from, to) => {
    const { data, error } = await supabaseServer
      .from("comp_signups")
      .select("stripe_session_id,stripe_payment_intent_id")
      .not("stripe_session_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to);
    return {
      data: (data as ClaimedIdRow[] | null) ?? null,
      error: error ? { message: error.message } : null,
    };
  });
  if (compsResult.error) {
    return { sessions: claimedSessions, paymentIntents: claimedPis, error: compsResult.error };
  }

  for (const row of [...signupsResult.data, ...compsResult.data]) {
    if (row.stripe_session_id) claimedSessions.add(row.stripe_session_id);
    if (row.stripe_payment_intent_id) claimedPis.add(row.stripe_payment_intent_id);
  }

  return { sessions: claimedSessions, paymentIntents: claimedPis, error: null };
}

async function runBackfill(req: NextRequest) {
  const auth = await requireFinanceAuth(req, { requireAdmin: true });
  if (!auth.ok) return auth.response;

  let dryRun = true;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body === "object" && "dryRun" in body) {
      dryRun = body.dryRun !== false;
    }
  } catch {
    dryRun = true;
  }

  const loaded = await loadMissingSignupCandidates();
  if (loaded.error) {
    return NextResponse.json(
      { error: "Failed to fetch signups needing backfill", details: loaded.error },
      { status: 500 }
    );
  }
  const candidates = loaded.data;

  const claimed = await loadClaimedStripeIds();
  if (claimed.error) {
    return NextResponse.json(
      { error: "Failed to fetch already-claimed Stripe IDs", details: claimed.error },
      { status: 500 }
    );
  }

  let sessions: BackfillSessionInfo[];
  try {
    sessions = await listSignupCheckoutSessions();
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to list Stripe Checkout sessions",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }

  const matches = matchSessionsToSignups(
    sessions,
    candidates,
    claimed.sessions,
    claimed.paymentIntents
  );

  const updates = matches.filter(
    (m): m is Extract<typeof m, { kind: "tier1" | "tier2" }> =>
      m.kind === "tier1" || m.kind === "tier2"
  );
  const ambiguous = matches.filter((m) => m.kind === "ambiguous");
  const unmatched = matches.filter((m) => m.kind === "unmatched");

  const errors: { signupId: string; isComp: boolean; error: string }[] = [];
  let updated = 0;

  if (!dryRun) {
    const now = new Date().toISOString();
    for (const u of updates) {
      const table = u.isComp ? "comp_signups" : "signups";
      const { error } = await supabaseServer
        .from(table)
        .update({
          stripe_session_id: u.sessionId,
          stripe_payment_intent_id: u.paymentIntentId,
          updated_at: now,
        })
        .eq("id", u.signupId)
        .is("stripe_session_id", null);
      if (error) {
        errors.push({ signupId: u.signupId, isComp: u.isComp, error: error.message });
      } else {
        updated += 1;
      }
    }
  }

  const candidateIds = candidates
    .filter((c) => !c.is_comp)
    .map((c) => Number(c.id))
    .filter((n) => Number.isFinite(n));
  const minCandidateId = candidateIds.length ? Math.min(...candidateIds) : null;
  const maxCandidateId = candidateIds.length ? Math.max(...candidateIds) : null;

  return NextResponse.json({
    success: true,
    dryRun,
    candidatesMissingIds: candidates.length,
    candidatesSignups: loaded.signupCount,
    candidatesComps: loaded.compCount,
    candidateIdRange:
      minCandidateId != null && maxCandidateId != null
        ? { min: minCandidateId, max: maxCandidateId }
        : null,
    claimedSessionIds: claimed.sessions.size,
    sessionsConsidered: sessions.length,
    wouldUpdate: updates.length,
    updated: dryRun ? 0 : updated,
    ambiguous: ambiguous.length,
    unmatched: unmatched.length,
    errors,
    samples: {
      updates: updates.slice(0, 25),
      ambiguous: ambiguous.slice(0, 15),
      unmatched: unmatched.slice(0, 15),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    return await runBackfill(req);
  } catch (e) {
    console.error("backfill-signup-stripe-ids", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
