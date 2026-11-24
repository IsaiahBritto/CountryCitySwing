import type { NextRequest } from "next/server";

export function clientIpFromRequest(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

/** Fields to merge into a profiles update when toggling weekly newsletter. */
export function newsletterProfileUpdateFields(input: {
  optIn: boolean;
  source?: string | null;
  ip?: string | null;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  if (input.optIn) {
    return {
      newsletter_opt_in: true,
      newsletter_consent_at: now,
      newsletter_consent_source: (input.source ?? "profile").trim() || "profile",
      newsletter_consent_ip: input.ip ?? null,
      newsletter_opt_out_at: null,
    };
  }
  return {
    newsletter_opt_in: false,
    newsletter_opt_out_at: now,
  };
}
