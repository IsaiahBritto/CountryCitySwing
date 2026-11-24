import { supabaseServer } from "@/lib/supabaseServer";

const ROW_ID = "default";

export type AppleMusicSessionCredentials = {
  musicUserToken: string;
  storefrontId: string | null;
  updatedAt: string;
};

export async function getStoredAppleMusicUserToken(): Promise<AppleMusicSessionCredentials | null> {
  const { data, error } = await supabaseServer
    .from("apple_music_session_credentials")
    .select("music_user_token, storefront_id, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error || !data?.music_user_token) return null;
  return {
    musicUserToken: data.music_user_token,
    storefrontId: data.storefront_id ?? null,
    updatedAt: data.updated_at,
  };
}

export async function persistAppleMusicUserToken(input: {
  musicUserToken: string;
  storefrontId?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer.from("apple_music_session_credentials").upsert(
    {
      id: ROW_ID,
      music_user_token: input.musicUserToken.trim(),
      storefront_id: input.storefrontId?.trim() || null,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) {
    throw new Error(`Failed to save Apple Music session: ${error.message}`);
  }
}
