import { buildPrivateLessonCancelUrl } from "@/lib/privateLessonCancelUrl";
import { supabaseServer } from "@/lib/supabaseServer";

export async function getPrivateLessonCancelUrlForBooking(
  bookingId: string | undefined
): Promise<string | null> {
  if (!bookingId?.trim()) return null;

  const { data, error } = await supabaseServer
    .from("lesson_bookings")
    .select("cancel_token")
    .eq("id", bookingId.trim())
    .maybeSingle();

  if (error || !data?.cancel_token) return null;
  return buildPrivateLessonCancelUrl(String(data.cancel_token));
}
