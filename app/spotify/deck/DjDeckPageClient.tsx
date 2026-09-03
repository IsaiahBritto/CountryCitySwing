"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import AudioUnlockOverlay from "@/components/dj/AudioUnlockOverlay";
import DeckPanel from "@/components/dj/DeckPanel";
import MixerBar from "@/components/dj/MixerBar";
import PlaylistSelector from "@/components/dj/PlaylistSelector";
import QueuePanel from "@/components/dj/QueuePanel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  djDeckReducer,
  getDeckSlot,
  getIncomingDeck,
  getNowPlaying,
  INITIAL_DJ_DECK_STATE,
  queueRowStatus,
  type DeckId,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";
import {
  computeEffectiveVolume,
  isNearTrackEnd,
  runSequentialCrossfade,
  shouldTriggerCrossfadeTransition,
} from "@/lib/spotify/playerFade";
import { useSpotifyPlayer } from "@/lib/spotify/useSpotifyPlayer";

type SpotifyStatus = {
  connected: boolean;
  spotifyUserId: string | null;
  grantedScopes: string | null;
  needsDeckReconnect: boolean;
  product: "premium" | "free" | "open" | null;
};

type ActivePlaylistInfo = {
  name: string | null;
  isActive: boolean;
};

export default function DjDeckPageClient() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(
    null
  );
  const [activeSocial, setActiveSocial] = useState<ActivePlaylistInfo | null>(
    null
  );
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [connectingAudio, setConnectingAudio] = useState(false);

  const [state, dispatch] = useReducer(djDeckReducer, INITIAL_DJ_DECK_STATE);
  const automixTriggeredRef = useRef(false);
  const crossfadeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const transitionInFlightRef = useRef(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const player = useSpotifyPlayer({
    authToken,
    enabled: Boolean(authToken && audioUnlocked),
    onPlaybackError: showToast,
  });

  const loadSpotifyStatus = useCallback(async (token: string) => {
    const res = await fetch("/api/spotify/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (body as { error?: string }).error ?? "Failed to load Spotify status"
      );
    }
    setSpotifyStatus(body as SpotifyStatus);

    const activeRes = await fetch("/api/spotify/active-playlist", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (activeRes.ok) {
      const activeBody = await activeRes.json();
      setActiveSocial({
        name: (activeBody as { name?: string | null }).name ?? null,
        isActive: Boolean((activeBody as { isActive?: boolean }).isActive),
      });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.user) {
        setIsAdmin(false);
        setAuthToken(null);
        setLoading(false);
        return;
      }
      const meRes = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!meRes.ok) {
        setIsAdmin(false);
        setAuthToken(null);
        setLoading(false);
        return;
      }
      const me = await meRes.json();
      const admin = (me.profile?.role || "").toLowerCase() === "admin";
      setIsAdmin(admin);
      if (!admin) {
        setAuthToken(null);
        setLoading(false);
        return;
      }
      setAuthToken(session.access_token);
      try {
        await loadSpotifyStatus(session.access_token);
      } catch (err) {
        setPageError(err instanceof Error ? err.message : "Failed to load status");
      }
      setLoading(false);
    };
    void init();
  }, [loadSpotifyStatus]);

  const handleUnlockAudio = async () => {
    setConnectingAudio(true);
    try {
      await player.connect();
      setAudioUnlocked(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to connect player");
    } finally {
      setConnectingAudio(false);
    }
  };

  const applyLiveVolume = useCallback(() => {
    if (state.isTransitioning) return;
    const volume = computeEffectiveVolume({
      deckVolume: state.deckVolume,
      masterVolume: state.masterVolume,
      crossfader: state.crossfader,
      activeDeck: state.activeDeck,
    });
    player.setVolume(volume);
  }, [
    player,
    state.activeDeck,
    state.crossfader,
    state.deckVolume,
    state.isTransitioning,
    state.masterVolume,
  ]);

  useEffect(() => {
    applyLiveVolume();
  }, [applyLiveVolume]);

  const runTransition = useCallback(async () => {
    if (transitionInFlightRef.current || state.isTransitioning) return;

    const incoming = getIncomingDeck(state.activeDeck);
    const incomingTrack = getDeckSlot(state, incoming).track;
    if (!incomingTrack || !player.deviceId) return;
    if (player.currentTrackUri === incomingTrack.uri && player.isPlaying) {
      dispatch({ type: "SET_ACTIVE_DECK", deck: incoming });
      dispatch({ type: "ADVANCE_AFTER_TRANSITION" });
      return;
    }

    transitionInFlightRef.current = true;
    dispatch({ type: "SET_TRANSITIONING", value: true });
    automixTriggeredRef.current = false;

    const targetVolume = computeEffectiveVolume({
      deckVolume: state.deckVolume,
      masterVolume: state.masterVolume,
      crossfader: incoming === "A" ? 0 : 100,
      activeDeck: incoming,
    });

    try {
      await runSequentialCrossfade({
        fadeMs: state.fadeMs,
        getVolume: () => player.volume,
        setVolume: (v) => player.setVolume(v),
        onSwitch: () => player.playUri(incomingTrack.uri),
        targetVolume,
      });
      dispatch({ type: "ADVANCE_AFTER_TRANSITION" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Transition failed");
    } finally {
      dispatch({ type: "SET_TRANSITIONING", value: false });
      transitionInFlightRef.current = false;
    }
  }, [player, showToast, state]);

  useEffect(() => {
    if (state.isTransitioning) return;
    if (!shouldTriggerCrossfadeTransition(state.crossfader, state.activeDeck)) {
      return;
    }
    if (crossfadeDebounceRef.current) {
      clearTimeout(crossfadeDebounceRef.current);
    }
    crossfadeDebounceRef.current = setTimeout(() => {
      void runTransition();
    }, 300);
    return () => {
      if (crossfadeDebounceRef.current) {
        clearTimeout(crossfadeDebounceRef.current);
      }
    };
  }, [state.crossfader, state.activeDeck, state.isTransitioning, runTransition]);

  useEffect(() => {
    if (!state.automixEnabled || state.isTransitioning) return;
    if (!player.isPlaying || player.durationMs <= 0) return;

    if (
      isNearTrackEnd(player.positionMs, player.durationMs, state.fadeMs) &&
      !automixTriggeredRef.current
    ) {
      automixTriggeredRef.current = true;
      const incoming = getIncomingDeck(state.activeDeck);
      const incomingTrack = getDeckSlot(state, incoming).track;
      if (!incomingTrack) {
        const nextIndex = state.queueCursor + 1;
        const nextTrack = state.queue[nextIndex];
        if (nextTrack) {
          dispatch({
            type: "LOAD_TO_DECK",
            deck: incoming,
            track: nextTrack,
            queueIndex: nextIndex,
          });
        }
      }
      void runTransition();
    }

    if (player.positionMs < player.durationMs - state.fadeMs - 1000) {
      automixTriggeredRef.current = false;
    }
  }, [
    player.isPlaying,
    player.positionMs,
    player.durationMs,
    runTransition,
    state,
  ]);

  const handlePlayPause = async (deckId: DeckId) => {
    const slot = getDeckSlot(state, deckId);
    if (!slot.track) return;

    if (deckId !== state.activeDeck) {
      dispatch({ type: "SET_ACTIVE_DECK", deck: deckId });
    }

    const isLive =
      deckId === state.activeDeck &&
      player.currentTrackUri === slot.track.uri;

    try {
      if (isLive && player.isPlaying) {
        await player.pause();
      } else {
        await player.playUri(slot.track.uri);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Playback failed");
    }
  };

  const handleLoadToDeck = (index: number, deck: DeckId) => {
    const track = state.queue[index];
    if (!track) return;
    dispatch({ type: "LOAD_TO_DECK", deck, track, queueIndex: index });
  };

  const handlePlayFromRow = async (index: number) => {
    const track = state.queue[index];
    if (!track) return;
    dispatch({
      type: "LOAD_TO_DECK",
      deck: state.activeDeck,
      track,
      queueIndex: index,
    });
    try {
      await player.playUri(track.uri);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Playback failed");
    }
  };

  const handlePlaylistChange = useCallback(
    ({ id, name }: { id: string; name: string }) => {
      dispatch({ type: "SELECT_PLAYLIST", playlistId: id, playlistName: name });
    },
    []
  );

  const handleQueueLoaded = useCallback(
    ({
      tracks,
      totalDurationMs,
    }: {
      tracks: DeckTrack[];
      totalDurationMs: number;
    }) => {
      dispatch({ type: "SET_QUEUE", queue: tracks, totalDurationMs });
      automixTriggeredRef.current = false;
    },
    []
  );

  const incomingDeck = getIncomingDeck(state.activeDeck);
  const canTransition = Boolean(getDeckSlot(state, incomingDeck).track);

  const activeBpm = useMemo(() => {
    const now = getNowPlaying(state);
    return now?.bpm ?? null;
  }, [state]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }

      const highlighted = state.highlightedQueueIndex ?? state.queueCursor;

      switch (e.key) {
        case " ":
          e.preventDefault();
          void handlePlayPause(state.activeDeck);
          break;
        case "t":
        case "T":
          void runTransition();
          break;
        case "1":
          if (state.queue[highlighted]) {
            handleLoadToDeck(highlighted, "A");
          }
          break;
        case "2":
          if (state.queue[highlighted]) {
            handleLoadToDeck(highlighted, "B");
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          dispatch({
            type: "HIGHLIGHT_QUEUE_ROW",
            index: Math.max(0, highlighted - 1),
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          dispatch({
            type: "HIGHLIGHT_QUEUE_ROW",
            index: Math.min(state.queue.length - 1, highlighted + 1),
          });
          break;
        case "Enter":
          void handlePlayFromRow(highlighted);
          break;
        case "a":
        case "A":
          dispatch({ type: "SET_ACTIVE_DECK", deck: "A" });
          break;
        case "b":
        case "B":
          dispatch({ type: "SET_ACTIVE_DECK", deck: "B" });
          break;
        case "m":
        case "M":
          dispatch({ type: "SET_AUTOMIX", value: !state.automixEnabled });
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const connectSpotify = async () => {
    if (!authToken) return;
    const res = await fetch("/api/spotify/auth", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(
        (data as { error?: string }).error ?? "Failed to start Spotify auth"
      );
      return;
    }
    const url = (data as { url?: string }).url;
    if (url) window.location.href = url;
  };

  if (loading) {
    return (
      <section className="max-w-[1600px] mx-auto w-full px-4 py-8">
        <p className="text-neutral-400">Loading DJ deck…</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="max-w-xl mx-auto text-center py-12">
        <h1 className="text-xl font-semibold text-neutral-100">Admin access required</h1>
        <p className="text-neutral-400 mt-2 text-sm">
          The DJ deck is only available to CCS admins.
        </p>
        <Link href="/" className="text-amber-400 underline text-sm mt-4 inline-block">
          Back to home
        </Link>
      </section>
    );
  }

  const needsOverlay =
    !audioUnlocked &&
    player.status !== "ready" &&
    spotifyStatus?.connected &&
    !spotifyStatus.needsDeckReconnect &&
    spotifyStatus.product === "premium";

  return (
    <>
      {needsOverlay && (
        <AudioUnlockOverlay
          onUnlock={() => void handleUnlockAudio()}
          loading={connectingAudio}
        />
      )}

      <section className="max-w-[1600px] mx-auto w-full min-h-[calc(100vh-4rem)] flex flex-col px-4 py-3 gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-neutral-100">DJ Deck</h1>
            {authToken && (
              <PlaylistSelector
                authToken={authToken}
                value={state.selectedPlaylistId}
                onChange={handlePlaylistChange}
                onQueueLoaded={handleQueueLoaded}
                disabled={state.isTransitioning}
              />
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {spotifyStatus?.spotifyUserId && (
              <span className="text-neutral-500 text-xs">
                {spotifyStatus.spotifyUserId}
                {spotifyStatus.product === "premium" && (
                  <span className="ml-2 text-emerald-400">Premium</span>
                )}
              </span>
            )}
            <Link
              href="/spotify"
              className="text-amber-400 hover:text-amber-300 underline text-sm"
            >
              ← Spotify admin
            </Link>
          </div>
        </header>

        {!spotifyStatus?.connected && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Spotify is not connected.{" "}
            <Link href="/spotify" className="underline">
              Connect on /spotify
            </Link>{" "}
            first.
          </div>
        )}

        {spotifyStatus?.needsDeckReconnect && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100 flex flex-wrap items-center gap-3">
            <span>
              Reconnect Spotify to grant playback scopes (
              <code className="text-xs">streaming</code>,{" "}
              <code className="text-xs">user-modify-playback-state</code>).
            </span>
            <button
              type="button"
              onClick={() => void connectSpotify()}
              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium"
            >
              Reconnect Spotify
            </button>
          </div>
        )}

        {spotifyStatus?.connected && spotifyStatus.product !== "premium" && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            Spotify Premium is required for in-browser playback on the DJ deck.
          </div>
        )}

        {player.error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {player.error}
          </div>
        )}

        {pageError && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {pageError}
          </div>
        )}

        {activeSocial?.isActive && activeSocial.name && (
          <p className="text-xs text-neutral-500">
            Social requests active on:{" "}
            <span className="text-neutral-400">{activeSocial.name}</span> (deck
            playlist is independent)
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
          <DeckPanel
            deckId="A"
            accent="orange"
            slot={state.deckA}
            isActive={state.activeDeck === "A"}
            isPlaying={state.activeDeck === "A" && player.isPlaying}
            positionMs={state.activeDeck === "A" ? player.positionMs : 0}
            durationMs={
              state.activeDeck === "A"
                ? player.durationMs
                : state.deckA.track?.durationMs ?? 0
            }
            onPlayPause={() => void handlePlayPause("A")}
            volume={state.deckVolume.A}
            onVolumeChange={(v) =>
              dispatch({ type: "SET_DECK_VOLUME", deck: "A", value: v })
            }
            disabled={state.isTransitioning || player.status !== "ready"}
          />

          <MixerBar
            crossfader={state.crossfader}
            onCrossfaderChange={(v) =>
              dispatch({ type: "SET_CROSSFADER", value: v })
            }
            masterVolume={state.masterVolume}
            onMasterVolumeChange={(v) =>
              dispatch({ type: "SET_MASTER_VOLUME", value: v })
            }
            fadeMs={state.fadeMs}
            onFadeMsChange={(v) => dispatch({ type: "SET_FADE_MS", value: v })}
            onTransition={() => void runTransition()}
            isTransitioning={state.isTransitioning}
            bpm={activeBpm}
            automixEnabled={state.automixEnabled}
            onAutomixChange={(v) => dispatch({ type: "SET_AUTOMIX", value: v })}
            canTransition={canTransition}
            disabled={player.status !== "ready"}
          />

          <DeckPanel
            deckId="B"
            accent="red"
            slot={state.deckB}
            isActive={state.activeDeck === "B"}
            isPlaying={state.activeDeck === "B" && player.isPlaying}
            positionMs={state.activeDeck === "B" ? player.positionMs : 0}
            durationMs={
              state.activeDeck === "B"
                ? player.durationMs
                : state.deckB.track?.durationMs ?? 0
            }
            onPlayPause={() => void handlePlayPause("B")}
            volume={state.deckVolume.B}
            onVolumeChange={(v) =>
              dispatch({ type: "SET_DECK_VOLUME", deck: "B", value: v })
            }
            disabled={state.isTransitioning || player.status !== "ready"}
          />
        </div>

        <QueuePanel
          queue={state.queue}
          rowStatus={(index) => queueRowStatus(state, index)}
          onLoadToDeck={handleLoadToDeck}
          onPlayFromRow={(index) => void handlePlayFromRow(index)}
          highlightedIndex={state.highlightedQueueIndex}
          totalDurationMs={state.totalDurationMs}
          disabled={state.isTransitioning || player.status !== "ready"}
        />

        <p className="text-[10px] text-neutral-600 text-center pb-2">
          Space play/pause · T transition · 1/2 load to A/B · ↑↓ navigate · Enter
          play · M automix
        </p>

        {toast && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-neutral-600 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 shadow-lg">
            {toast}
          </div>
        )}
      </section>
    </>
  );
}
