import { randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CHARSET[bytes[i]! % CHARSET.length];
  }
  return out;
}

export function formatGiftCardCodeDisplay(code: string): string {
  return code;
}

/** Generate CCS-XXXX-XXXX style code; collision-checked against gift_cards.code */
export async function generateGiftCardCode(maxAttempts = 8): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = `CCS-${randomSegment(4)}-${randomSegment(4)}`;
    const { data } = await supabaseServer
      .from("gift_cards")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not generate unique gift card code");
}

export function normalizeGiftCardCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}