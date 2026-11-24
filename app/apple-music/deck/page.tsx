import { redirect } from "next/navigation";
import { musicDeckPath } from "@/lib/music/providerSegments";

export const dynamic = "force-dynamic";

export default function LegacyAppleDeckRedirect() {
  redirect(musicDeckPath("apple_music"));
}
