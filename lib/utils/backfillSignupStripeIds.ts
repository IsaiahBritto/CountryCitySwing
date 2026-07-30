export const BACKFILL_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
export const BACKFILL_AMBIGUITY_EPSILON_MS = 5 * 60 * 1000; // 5 minutes

export type BackfillSignupCandidate = {
  id: string;
  event_id: string;
  email: string | null;
  created_at: string;
  is_comp: boolean;
};

export type BackfillSessionInfo = {
  id: string;
  payment_intent_id: string | null;
  created: number; // unix seconds
  payment_type: string | null;
  signup_id: string | null;
  comp_signup_id: string | null;
  client_reference_id: string | null;
  email: string | null;
  event_id: string | null;
};

export type BackfillMatch =
  | {
      kind: "tier1" | "tier2";
      sessionId: string;
      paymentIntentId: string | null;
      signupId: string;
      isComp: boolean;
      deltaMs: number | null;
    }
  | {
      kind: "ambiguous";
      sessionId: string;
      candidates: { signupId: string; isComp: boolean; deltaMs: number }[];
    }
  | {
      kind: "unmatched";
      sessionId: string;
      reason: string;
    };

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  return t || null;
}

export function isSignupPaymentType(paymentType: string | null | undefined): boolean {
  return (
    paymentType === "stripe_checkout" ||
    paymentType === "cash_to_stripe" ||
    paymentType === "comp_signup" ||
    paymentType === "comp_signup_cash_to_stripe"
  );
}

/**
 * Match completed Checkout Sessions to signups missing Stripe IDs.
 * Tier 1: direct id. Tier 2: email + event_id + created_at within window.
 */
export function matchSessionsToSignups(
  sessions: BackfillSessionInfo[],
  candidates: BackfillSignupCandidate[],
  alreadyClaimedSessionIds: Set<string> = new Set(),
  alreadyClaimedPaymentIntentIds: Set<string> = new Set()
): BackfillMatch[] {
  const results: BackfillMatch[] = [];
  const available = new Map(
    candidates.map((c) => [`${c.is_comp ? "c" : "s"}:${c.id}`, { ...c }])
  );
  const claimedSessions = new Set(alreadyClaimedSessionIds);
  const claimedPis = new Set(alreadyClaimedPaymentIntentIds);

  const claim = (key: string, sessionId: string, pi: string | null) => {
    available.delete(key);
    claimedSessions.add(sessionId);
    if (pi) claimedPis.add(pi);
  };

  for (const session of sessions) {
    if (!isSignupPaymentType(session.payment_type)) continue;
    if (claimedSessions.has(session.id)) {
      results.push({
        kind: "unmatched",
        sessionId: session.id,
        reason: "session_already_claimed",
      });
      continue;
    }
    if (session.payment_intent_id && claimedPis.has(session.payment_intent_id)) {
      results.push({
        kind: "unmatched",
        sessionId: session.id,
        reason: "payment_intent_already_claimed",
      });
      continue;
    }

    const isCompType =
      session.payment_type === "comp_signup" ||
      session.payment_type === "comp_signup_cash_to_stripe";

    // Tier 1 — direct ID
    const directId = isCompType
      ? session.comp_signup_id || session.client_reference_id
      : session.signup_id || session.client_reference_id;

    if (directId) {
      const key = `${isCompType ? "c" : "s"}:${directId}`;
      const hit = available.get(key);
      if (hit) {
        claim(key, session.id, session.payment_intent_id);
        results.push({
          kind: "tier1",
          sessionId: session.id,
          paymentIntentId: session.payment_intent_id,
          signupId: hit.id,
          isComp: hit.is_comp,
          deltaMs: null,
        });
        continue;
      }
    }

    // Tier 2 — email + event + time (mainly historical stripe_checkout)
    if (isCompType) {
      results.push({
        kind: "unmatched",
        sessionId: session.id,
        reason: "comp_no_direct_id_match",
      });
      continue;
    }

    const email = normalizeEmail(session.email);
    const eventId = session.event_id;
    if (!email || !eventId) {
      results.push({
        kind: "unmatched",
        sessionId: session.id,
        reason: "missing_email_or_event_id",
      });
      continue;
    }

    const sessionMs = session.created * 1000;
    const inWindow: { key: string; c: BackfillSignupCandidate; deltaMs: number }[] = [];
    for (const [key, c] of available) {
      if (c.is_comp) continue;
      if (c.event_id !== eventId) continue;
      if (normalizeEmail(c.email) !== email) continue;
      const createdMs = Date.parse(c.created_at);
      if (!Number.isFinite(createdMs)) continue;
      const deltaMs = Math.abs(createdMs - sessionMs);
      if (deltaMs <= BACKFILL_MATCH_WINDOW_MS) {
        inWindow.push({ key, c, deltaMs });
      }
    }

    if (inWindow.length === 0) {
      results.push({
        kind: "unmatched",
        sessionId: session.id,
        reason: "no_email_event_time_match",
      });
      continue;
    }

    inWindow.sort((a, b) => a.deltaMs - b.deltaMs);
    const best = inWindow[0];
    const second = inWindow[1];
    if (
      second &&
      Math.abs(second.deltaMs - best.deltaMs) < BACKFILL_AMBIGUITY_EPSILON_MS
    ) {
      results.push({
        kind: "ambiguous",
        sessionId: session.id,
        candidates: inWindow.slice(0, 3).map((x) => ({
          signupId: x.c.id,
          isComp: x.c.is_comp,
          deltaMs: x.deltaMs,
        })),
      });
      continue;
    }

    claim(best.key, session.id, session.payment_intent_id);
    results.push({
      kind: "tier2",
      sessionId: session.id,
      paymentIntentId: session.payment_intent_id,
      signupId: best.c.id,
      isComp: best.c.is_comp,
      deltaMs: best.deltaMs,
    });
  }

  return results;
}
