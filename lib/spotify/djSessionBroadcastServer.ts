import { randomId } from "@/lib/randomId";
import type { DeckId } from "@/lib/spotify/djDeckState";
import type { DeckPlaylistPatch } from "@/lib/spotify/deckPlaylistSync";
import { sessionChannelName } from "@/lib/spotify/djSessionChannel";
import { supabaseServer } from "@/lib/supabaseServer";

const SERVER_CLIENT_ID = "social-request-server";

export async function broadcastDjSessionCommand(params: {
  sessionId: string;
  command: unknown;
}): Promise<void> {
  const broadcast = {
    command: params.command,
    commandId: randomId(),
    clientId: SERVER_CLIENT_ID,
    issuedAt: new Date().toISOString(),
  };

  const channel = supabaseServer.channel(sessionChannelName(params.sessionId));
  const subscribed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Supabase channel subscribe timeout"));
    }, 5000);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Supabase channel subscribe failed: ${status}`));
      }
    });
  });

  await subscribed;
  const sendResult = await channel.send({
    type: "broadcast",
    event: "session_command",
    payload: broadcast,
  });

  await supabaseServer.removeChannel(channel);

  if (sendResult !== "ok") {
    throw new Error(`Supabase broadcast failed: ${sendResult}`);
  }
}

export async function notifyDeckPlaylistPatch(params: {
  sessionId: string;
  deck: DeckId;
  patch: DeckPlaylistPatch;
}): Promise<void> {
  await broadcastDjSessionCommand({
    sessionId: params.sessionId,
    command: {
      type: "DISPATCH_DECK_ACTION",
      action: {
        type: "APPLY_PLAYLIST_PATCH",
        deck: params.deck,
        patch: params.patch,
      },
    },
  });
}
