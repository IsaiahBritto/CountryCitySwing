// lib/supabaseBrowser.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseBrowser = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

/** True if real Supabase env vars are set (useful for hiding auth-dependent UI when not configured). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
