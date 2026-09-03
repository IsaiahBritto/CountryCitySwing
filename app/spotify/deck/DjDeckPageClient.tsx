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
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import AudioUnlockOverlay from "@/components/dj/AudioUnlockOverlay";
import DeckPanel from "@/components/dj/DeckPanel";
import MixerBar from "@/components/dj/MixerBar";
import PlayQueuePanel from "@/components/dj/PlayQueuePanel";
import PlaylistPanel from "@/components/dj/PlaylistPanel";
import PlaylistSelector from "@/components/dj/PlaylistSelector";
import VolumeSlider from "@/components/dj/VolumeSlider";
import { apiError, authedFetchWithRetry, getAccessToken } from "@/lib/clientAuth";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  crossfadeSecondsToMs,
  djDeckReducer,
  getDeckState,
  getNextUnplayedPlaylistIndex,
  getNowPlaying,
  getQueueHead,
  getUpNext,
  INITIAL_DJ_DECK_STATE,
  isPlayQueueExhausted,
  isTrackInPlayQueue,
  playQueueRowStatus,
  playlistRowStatus,
  shouldPlayQueueNext,
  type DeckId,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";
import {
  computeEffectiveVolume,
  createVolumeRamp,
  isNearTrackEnd,
} from "@/lib/spotify/playerFade";
import { trackUrisMatch } from "@/lib/spotify/trackUri";
import { useSpotifyPlayer } from "@/lib/spotify/useSpotifyPlayer";
import { usePlaybackClock } from "@/lib/spotify/usePlaybackClockHook";

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
  const stateRef = useRef(state);
  stateRef.current = state;

  const trackEndTriggeredRef = useRef(false);
  const wasPlayingActiveTrackRef = useRef(false);
  const prevActivePositionRef = useRef(0);
  const lastBackKeyAtRef = useRef(0);
  const crossfadeInProgressRef = useRef(false);
  const crossfadeCancelRef = useRef<(() => void) | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const player = useSpotifyPlayer({
    authToken,
    enabled: Boolean(authToken && audioUnlocked),
    onPlaybackError: showToast,
    onPlaybackInterrupted: showToast,
  });

  const activeTrack = useMemo(() => getNowPlaying(state), [state]);
  const activeTrackUri = activeTrack?.uri ?? null;
  const activeDurationMs = activeTrack?.durationMs ?? 0;
  const isSdkOnActiveTrack =
    Boolean(activeTrackUri) &&
    trackUrisMatch(player.currentTrackUri, activeTrackUri);
  const isActiveTrackPlaying = player.isPlaying && isSdkOnActiveTrack;

  const {
    displayPositionMs: clockPositionMs,
    reset: resetClock,
    pause: pauseClock,
    resume: resumeClock,
    syncFromSdk,
  } = usePlaybackClock({
    isPlaying: isActiveTrackPlaying,
    durationMs: activeDurationMs,
    trackUri: activeTrackUri,
  });

  // Keep the local clock aligned with Spotify SDK position for the active deck.
  useEffect(() => {
    if (!isSdkOnActiveTrack) return;
    syncFromSdk(player.positionMs, player.isPlaying);
  }, [isSdkOnActiveTrack, player.isPlaying, player.positionMs, syncFromSdk]);

  const loadSpotifyStatus = useCallback(async () => {
    const res = await authedFetchWithRetry("/api/spotify/status");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (body as { error?: string }).error ?? (await apiError(res))
      );
    }
    setSpotifyStatus(body as SpotifyStatus);

    const activeRes = await authedFetchWithRetry("/api/spotify/active-playlist");
    if (activeRes.ok) {
      const activeBody = await activeRes.json();
      setActiveSocial({
        name: (activeBody as { name?: string | null }).name ?? null,
        isActive: Boolean((activeBody as { isActive?: boolean }).isActive),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.user) {
        if (!cancelled) {
          setIsAdmin(false);
          setAuthToken(null);
          setLoading(false);
        }
        return;
      }
      const meRes = await authedFetchWithRetry("/api/me");
      if (!meRes.ok) {
        if (!cancelled) {
          setIsAdmin(false);
          setAuthToken(null);
          setLoading(false);
        }
        return;
      }
      const me = await meRes.json();
      const admin = (me.profile?.role || "").toLowerCase() === "admin";
      if (!cancelled) {
        setIsAdmin(admin);
        if (!admin) {
          setAuthToken(null);
          setLoading(false);
          return;
        }
        setAuthToken(session.access_token);
      }
      try {
        await loadSpotifyStatus();
      } catch (err) {
        if (!cancelled) {
          setPageError(
            err instanceof Error ? err.message : "Failed to load status"
          );
        }
      }
      if (!cancelled) setLoading(false);
    };

    void init();

    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
      (_: AuthChangeEvent, session: Session | null) => {
        if (session?.access_token) {
          setAuthToken(session.access_token);
          void loadSpotifyStatus().catch(() => {
            /* status refresh is best-effort on token rotation */
          });
        } else {
          setAuthToken(null);
        }
      }
    );

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
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
    if (crossfadeInProgressRef.current) return;
    const current = stateRef.current;
    const volume = computeEffectiveVolume({
      deckVolume: current.deckVolume,
      masterVolume: current.masterVolume,
      activeDeck: current.activeDeck,
    });
    player.setVolume(volume);
  }, [player]);

  useEffect(() => {
    applyLiveVolume();
  }, [applyLiveVolume, state.activeDeck, state.deckVolume, state.masterVolume]);

  const cancelCrossfade = useCallback(() => {
    crossfadeCancelRef.current?.();
    crossfadeCancelRef.current = null;
    crossfadeInProgressRef.current = false;
  }, []);

  const playUriInstant = useCallback(
    async (track: DeckTrack, positionMs: number) => {
      if (positionMs > 0) {
        syncFromSdk(positionMs, false);
        await player.playUri(track.uri, positionMs);
        syncFromSdk(positionMs, true);
      } else {
        resetClock();
        await player.playUri(track.uri);
      }
    },
    [player, resetClock, syncFromSdk]
  );

  const runDeckCrossfade = useCallback(
    async (deck: DeckId, track: DeckTrack) => {
      const current = stateRef.current;
      const fadeMs = crossfadeSecondsToMs(current.deckCrossfadeSeconds[deck]);
      if (fadeMs <= 0) {
        await playUriInstant(track, 0);
        return;
      }

      cancelCrossfade();
      crossfadeInProgressRef.current = true;

      const targetVolume = computeEffectiveVolume({
        deckVolume: current.deckVolume,
        masterVolume: current.masterVolume,
        activeDeck: deck,
      });
      const startVolume = player.volume;

      const fadeOut = createVolumeRamp(
        (volume) => player.setVolume(volume),
        startVolume,
        0,
        fadeMs
      );
      crossfadeCancelRef.current = () => fadeOut.cancel();

      await fadeOut.done;
      if (!crossfadeInProgressRef.current) return;

      await playUriInstant(track, 0);
      if (!crossfadeInProgressRef.current) return;

      const fadeIn = createVolumeRamp(
        (volume) => player.setVolume(volume),
        0,
        targetVolume,
        fadeMs
      );
      crossfadeCancelRef.current = () => fadeIn.cancel();

      await fadeIn.done;

      crossfadeCancelRef.current = null;
      crossfadeInProgressRef.current = false;
      applyLiveVolume();
    },
    [applyLiveVolume, cancelCrossfade, playUriInstant, player]
  );

  const startPlayback = useCallback(
    async (deck: DeckId, track: DeckTrack, positionMs = 0) => {
      try {
        if (
          player.currentTrackUri &&
          trackUrisMatch(player.currentTrackUri, track.uri) &&
          !player.isPlaying &&
          positionMs === 0
        ) {
          await player.resume();
          resumeClock();
          return;
        }

        const current = stateRef.current;
        const shouldCrossfade =
          positionMs === 0 &&
          deck === current.activeDeck &&
          player.isPlaying &&
          crossfadeSecondsToMs(current.deckCrossfadeSeconds[deck]) > 0 &&
          (!player.currentTrackUri ||
            !trackUrisMatch(player.currentTrackUri, track.uri));

        if (shouldCrossfade) {
          await runDeckCrossfade(deck, track);
          return;
        }

        cancelCrossfade();
        await playUriInstant(track, positionMs);
      } catch (err) {
        cancelCrossfade();
        applyLiveVolume();
        showToast(err instanceof Error ? err.message : "Playback failed");
      }
    },
    [
      applyLiveVolume,
      cancelCrossfade,
      playUriInstant,
      player,
      resumeClock,
      runDeckCrossfade,
      showToast,
    ]
  );

  const switchActiveDeck = useCallback(
    async (deck: DeckId) => {
      const current = stateRef.current;
      if (deck === current.activeDeck) return;

      const outgoing = current.activeDeck;
      const outgoingState = getDeckState(current, outgoing);

      if (
        outgoingState.track &&
        trackUrisMatch(player.currentTrackUri, outgoingState.track.uri)
      ) {
        dispatch({
          type: "SET_SAVED_POSITION",
          deck: outgoing,
          positionMs: clockPositionMs,
        });
        if (player.isPlaying) {
          try {
            await player.pause();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Pause failed");
          }
          pauseClock();
        }
      }

      dispatch({ type: "SET_ACTIVE_DECK", deck });
    },
    [clockPositionMs, pauseClock, player, showToast]
  );

  const handleQueueExhausted = useCallback(
    async (deck: DeckId) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);

      if (deckState.afterQueueBehavior === "stop") {
        dispatch({ type: "QUEUE_EXHAUSTED", deck });
        if (deck === current.activeDeck && player.isPlaying) {
          try {
            await player.pause();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Pause failed");
          }
          pauseClock();
        }
        return;
      }

      const targetDeck = current.secondDeckEnabled
        ? deckState.afterQueueContinueDeck
        : deck;

      dispatch({ type: "QUEUE_EXHAUSTED", deck });

      if (targetDeck === deck) {
        const afterExhausted = djDeckReducer(current, {
          type: "QUEUE_EXHAUSTED",
          deck,
        });
        const deckAfterExhaust = getDeckState(afterExhausted, deck);
        const nextIndex =
          deckAfterExhaust.playlistResumeIndex ??
          getNextUnplayedPlaylistIndex(afterExhausted, deck);
        if (nextIndex == null) {
          if (deck === current.activeDeck && player.isPlaying) {
            try {
              await player.pause();
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Pause failed");
            }
            pauseClock();
          }
          return;
        }

        dispatch({
          type: "TRANSITION_TO_PLAYLIST",
          deck,
          playlistIndex: nextIndex,
        });
        trackEndTriggeredRef.current = false;

        const targetTrack = getDeckState(
          djDeckReducer(afterExhausted, {
            type: "TRANSITION_TO_PLAYLIST",
            deck,
            playlistIndex: nextIndex,
          }),
          deck
        ).track;
        if (!targetTrack) return;

        await startPlayback(deck, targetTrack, 0);
        return;
      }

      const targetState = getDeckState(
        djDeckReducer(current, { type: "QUEUE_EXHAUSTED", deck }),
        targetDeck
      );
      if (!targetState.track) {
        if (current.activeDeck === deck && player.isPlaying) {
          try {
            await player.pause();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Pause failed");
          }
          pauseClock();
        }
        return;
      }

      trackEndTriggeredRef.current = false;
      await switchActiveDeck(targetDeck);
      await startPlayback(
        targetDeck,
        targetState.track,
        targetState.savedPositionMs
      );
    },
    [pauseClock, player, showToast, startPlayback, switchActiveDeck]
  );

  const startQueueHead = useCallback(
    async (deck: DeckId, autoPlay: boolean) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      const head = getQueueHead(deckState);
      if (!head) return;

      const queueIndex = deckState.skippedAfterCurrent;
      dispatch({ type: "SET_PLAY_QUEUE_INDEX", deck, index: queueIndex });
      trackEndTriggeredRef.current = false;

      if (autoPlay) {
        if (deck !== current.activeDeck) {
          await switchActiveDeck(deck);
        }
        await startPlayback(deck, head, 0);
      }
    },
    [startPlayback, switchActiveDeck]
  );

  const playDeck = useCallback(
    async (deck: DeckId) => {
      const current = stateRef.current;
      let deckState = getDeckState(current, deck);

      if (deckState.playQueue.length > 0 && deckState.playQueueIndex == null) {
        dispatch({ type: "SET_PLAY_QUEUE_INDEX", deck, index: 0 });
        deckState = getDeckState(
          djDeckReducer(current, {
            type: "SET_PLAY_QUEUE_INDEX",
            deck,
            index: 0,
          }),
          deck
        );
      }

      if (!deckState.track) return;

      if (deck !== current.activeDeck) {
        await switchActiveDeck(deck);
      }

      const track = deckState.track;
      const savedPosition = deckState.savedPositionMs;
      const sameUri = trackUrisMatch(player.currentTrackUri, track.uri);

      try {
        if (sameUri && player.isPlaying) {
          cancelCrossfade();
          applyLiveVolume();
          dispatch({
            type: "SET_SAVED_POSITION",
            deck,
            positionMs: clockPositionMs,
          });
          await player.pause();
          pauseClock();
        } else if (sameUri && !player.isPlaying) {
          if (savedPosition > 0) {
            await player.seek(savedPosition);
            syncFromSdk(savedPosition, true);
          } else {
            resumeClock();
          }
          await player.resume();
        } else {
          await startPlayback(deck, track, savedPosition);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Playback failed");
      }
    },
    [
      applyLiveVolume,
      cancelCrossfade,
      clockPositionMs,
      pauseClock,
      player,
      resumeClock,
      showToast,
      startPlayback,
      switchActiveDeck,
      syncFromSdk,
    ]
  );

  const advanceTrack = useCallback(
    async (deck: DeckId, autoPlay: boolean) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);

      if (
        deckState.playbackSource === "queue" &&
        isPlayQueueExhausted(current, deck)
      ) {
        if (autoPlay) {
          await handleQueueExhausted(deck);
        }
        return;
      }

      if (shouldPlayQueueNext(current, deck)) {
        if (deckState.playbackSource !== "queue") {
          await startQueueHead(deck, autoPlay);
          return;
        }

        dispatch({ type: "ADVANCE_TRACK", deck });
        trackEndTriggeredRef.current = false;

        const nextState = djDeckReducer(current, {
          type: "ADVANCE_TRACK",
          deck,
        });
        const nextTrack = getDeckState(nextState, deck).track;
        if (autoPlay && nextTrack) {
          if (deck !== current.activeDeck) {
            await switchActiveDeck(deck);
          }
          await startPlayback(deck, nextTrack, 0);
        }
        return;
      }

      if (deckState.playlistIndex == null) return;
      const nextIndex =
        deckState.playlistIndex + 1 + deckState.skippedAfterCurrent;
      const nextTrack = deckState.playlist[nextIndex];
      if (!nextTrack) return;

      dispatch({ type: "ADVANCE_TRACK", deck });
      trackEndTriggeredRef.current = false;

      if (autoPlay) {
        if (deck !== current.activeDeck) {
          await switchActiveDeck(deck);
        }
        await startPlayback(deck, nextTrack, 0);
      }
    },
    [handleQueueExhausted, startPlayback, startQueueHead, switchActiveDeck]
  );

  const restartTrack = useCallback(
    async (deck: DeckId) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      if (!deckState.track) return;

      dispatch({ type: "SET_SAVED_POSITION", deck, positionMs: 0 });

      if (
        deck === current.activeDeck &&
        trackUrisMatch(player.currentTrackUri, deckState.track.uri)
      ) {
        try {
          await player.seek(0);
          syncFromSdk(0, player.isPlaying);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Seek failed");
        }
      }
    },
    [player, showToast, syncFromSdk]
  );

  const skipUpNext = useCallback((deck: DeckId) => {
    dispatch({ type: "SKIP_UP_NEXT", deck });
  }, []);

  const previousTrack = useCallback(
    async (deck: DeckId) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      const activeIndex =
        deckState.playbackSource === "queue"
          ? deckState.playQueueIndex
          : deckState.playlistIndex;
      if (activeIndex == null || activeIndex <= 0) return;

      const list =
        deckState.playbackSource === "queue"
          ? deckState.playQueue
          : deckState.playlist;
      const prevTrack = list[activeIndex - 1];
      if (!prevTrack) return;

      dispatch({ type: "PREVIOUS_TRACK", deck });
      trackEndTriggeredRef.current = false;

      if (deck === current.activeDeck) {
        await startPlayback(deck, prevTrack, 0);
      }
    },
    [startPlayback]
  );

  const handlePlayFromPlaylistRow = useCallback(
    async (deck: DeckId, index: number) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      const track = deckState.playlist[index];
      if (!track) return;

      dispatch({ type: "SET_PLAYLIST_INDEX", deck, index });
      trackEndTriggeredRef.current = false;

      if (deck !== current.activeDeck) {
        await switchActiveDeck(deck);
      }
      await startPlayback(deck, track, 0);
    },
    [startPlayback, switchActiveDeck]
  );

  const handlePlayFromQueueRow = useCallback(
    async (deck: DeckId, index: number) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      const track = deckState.playQueue[index];
      if (!track) return;

      dispatch({ type: "SET_PLAY_QUEUE_INDEX", deck, index });
      trackEndTriggeredRef.current = false;

      if (deck !== current.activeDeck) {
        await switchActiveDeck(deck);
      }
      await startPlayback(deck, track, 0);
    },
    [startPlayback, switchActiveDeck]
  );

  const handleAddToPlayQueue = useCallback(
    async (deck: DeckId, index: number) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      const trackToAdd = deckState.playlist[index];
      if (!trackToAdd) return;

      const wasEmpty = deckState.playQueue.length === 0;
      dispatch({ type: "ADD_TO_PLAY_QUEUE", deck, track: trackToAdd });
      if (!wasEmpty) return;

      const deckIsActivelyPlaying =
        deck === current.activeDeck &&
        deckState.track != null &&
        trackUrisMatch(player.currentTrackUri, deckState.track.uri) &&
        player.isPlaying;

      if (deckIsActivelyPlaying) return;

      if (deck === current.activeDeck) {
        await startQueueHead(deck, true);
      }
    },
    [player, startQueueHead]
  );

  const handleRemoveFromPlayQueue = useCallback((deck: DeckId, index: number) => {
    dispatch({ type: "REMOVE_FROM_PLAY_QUEUE", deck, index });
  }, []);

  const handlePlaylistChange = useCallback(
    (deck: DeckId, { id, name }: { id: string; name: string }) => {
      dispatch({ type: "SELECT_PLAYLIST", deck, playlistId: id, playlistName: name });
    },
    []
  );

  const handlePlaylistLoaded = useCallback(
    (
      deck: DeckId,
      {
        tracks,
        totalDurationMs,
      }: {
        tracks: DeckTrack[];
        totalDurationMs: number;
      }
    ) => {
      dispatch({
        type: "SET_PLAYLIST",
        deck,
        playlist: tracks,
        playlistTotalDurationMs: totalDurationMs,
      });
      trackEndTriggeredRef.current = false;
    },
    []
  );

  useEffect(() => {
    if (!activeTrackUri || activeDurationMs <= 0 || !isSdkOnActiveTrack) {
      wasPlayingActiveTrackRef.current = false;
      return;
    }

    const positionMs = Math.max(clockPositionMs, player.positionMs);
    const wasPlaying = wasPlayingActiveTrackRef.current;
    wasPlayingActiveTrackRef.current = player.isPlaying;

    const activeDeck = stateRef.current.activeDeck;
    const fadeMs = crossfadeSecondsToMs(
      stateRef.current.deckCrossfadeSeconds[activeDeck]
    );
    const endThresholdMs = fadeMs > 0 ? fadeMs : 500;

    const nearEndWhilePlaying =
      player.isPlaying &&
      (fadeMs > 0
        ? isNearTrackEnd(positionMs, activeDurationMs, fadeMs)
        : positionMs >= activeDurationMs - endThresholdMs);
    const endedNaturally =
      wasPlaying &&
      !player.isPlaying &&
      (positionMs >= activeDurationMs - endThresholdMs ||
        prevActivePositionRef.current >= activeDurationMs - endThresholdMs);

    prevActivePositionRef.current = positionMs;

    if ((nearEndWhilePlaying || endedNaturally) && !trackEndTriggeredRef.current) {
      trackEndTriggeredRef.current = true;
      void advanceTrack(stateRef.current.activeDeck, true);
    }

    if (positionMs < activeDurationMs - Math.max(endThresholdMs, 2000)) {
      trackEndTriggeredRef.current = false;
    }
  }, [
    activeDurationMs,
    activeTrackUri,
    advanceTrack,
    clockPositionMs,
    isSdkOnActiveTrack,
    player.isPlaying,
    player.positionMs,
  ]);

  const playerReady = player.status === "ready";

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

      const current = stateRef.current;
      const activeDeck = current.activeDeck;
      const deckState = getDeckState(current, activeDeck);
      const highlighted =
        current.highlightedPlaylistIndex[activeDeck] ??
        deckState.playlistIndex ??
        0;

      switch (e.key) {
        case " ":
          e.preventDefault();
          void playDeck(activeDeck);
          break;
        case "ArrowLeft": {
          e.preventDefault();
          const now = Date.now();
          if (now - lastBackKeyAtRef.current < 400) {
            lastBackKeyAtRef.current = 0;
            void previousTrack(activeDeck);
          } else {
            lastBackKeyAtRef.current = now;
            void restartTrack(activeDeck);
          }
          break;
        }
        case "ArrowRight":
          e.preventDefault();
          void advanceTrack(activeDeck, true);
          break;
        case "ArrowUp":
          e.preventDefault();
          dispatch({
            type: "HIGHLIGHT_PLAYLIST_ROW",
            deck: activeDeck,
            index: Math.max(0, highlighted - 1),
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          dispatch({
            type: "HIGHLIGHT_PLAYLIST_ROW",
            deck: activeDeck,
            index: Math.min(deckState.playlist.length - 1, highlighted + 1),
          });
          break;
        case "Enter":
          void handlePlayFromPlaylistRow(activeDeck, highlighted);
          break;
        case "a":
        case "A":
          if (current.secondDeckEnabled) {
            void switchActiveDeck("A");
          }
          break;
        case "b":
        case "B":
          if (current.secondDeckEnabled) {
            void switchActiveDeck("B");
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    advanceTrack,
    handlePlayFromPlaylistRow,
    playDeck,
    previousTrack,
    restartTrack,
    switchActiveDeck,
  ]);

  const connectSpotify = async () => {
    const token = await getAccessToken();
    if (!token) return;
    const returnTo = encodeURIComponent("/spotify/deck");
    window.location.href = `/api/spotify/auth/start?returnTo=${returnTo}&token=${encodeURIComponent(token)}`;
  };

  const renderDeckPanel = (deckId: DeckId, accent: "orange" | "red") => {
    const deckState = getDeckState(state, deckId);
    const isActive = state.activeDeck === deckId;
    const sdkMatchesDeck =
      deckState.track != null &&
      trackUrisMatch(player.currentTrackUri, deckState.track.uri);
    const positionMs = isActive
      ? sdkMatchesDeck
        ? Math.max(clockPositionMs, player.positionMs)
        : deckState.savedPositionMs
      : deckState.savedPositionMs;

    return (
      <DeckPanel
        deckId={deckId}
        accent={accent}
        playlistName={deckState.playlistName}
        track={deckState.track}
        upNext={getUpNext(state, deckId)}
        isActive={isActive}
        isPlaying={isActive && isActiveTrackPlaying}
        positionMs={positionMs}
        durationMs={deckState.track?.durationMs ?? 0}
        onPlayPause={() => void playDeck(deckId)}
        onRestartTrack={() => void restartTrack(deckId)}
        onPreviousTrack={() => void previousTrack(deckId)}
        onSkipCurrent={() => void advanceTrack(deckId, isActive)}
        onSkipUpNext={() => skipUpNext(deckId)}
        volume={state.deckVolume[deckId]}
        onVolumeChange={(v) =>
          dispatch({ type: "SET_DECK_VOLUME", deck: deckId, value: v })
        }
        crossfadeSeconds={state.deckCrossfadeSeconds[deckId]}
        onCrossfadeChange={(seconds) =>
          dispatch({ type: "SET_DECK_CROSSFADE", deck: deckId, seconds })
        }
        disabled={!playerReady}
        playlistSelector={
          authToken ? (
            <PlaylistSelector
              deckId={deckId}
              value={deckState.playlistId}
              onChange={handlePlaylistChange}
              onPlaylistLoaded={handlePlaylistLoaded}
              disabled={!playerReady}
            />
          ) : undefined
        }
      />
    );
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

      <section className="max-w-[1600px] mx-auto w-full flex flex-col px-2 sm:px-4 py-3 gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-neutral-100">DJ Deck</h1>
            {!state.secondDeckEnabled && (
              <button
                type="button"
                onClick={() => dispatch({ type: "ENABLE_SECOND_DECK" })}
                className="px-3 py-1.5 rounded-lg border border-neutral-600 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              >
                + Add another playlist
              </button>
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

        {isAdmin && !authToken && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Session expired — sign in again to resume playback. Your deck layout
            is preserved until you leave this page.
          </div>
        )}

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
          <p className="hidden sm:block text-xs text-neutral-500">
            Social requests active on:{" "}
            <span className="text-neutral-400">{activeSocial.name}</span> (deck
            playlist is independent)
          </p>
        )}

        {player.status === "ready" && (
          <p className="hidden sm:block text-xs text-neutral-500">
            Keep this tab active. Close Spotify on other devices if playback
            stops.
          </p>
        )}

        {state.secondDeckEnabled ? (
          <div className="space-y-2 sm:space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 min-w-0">
              {renderDeckPanel("A", "orange")}
              {renderDeckPanel("B", "red")}
            </div>
            <div className="flex justify-center">
              <MixerBar
                activeDeck={state.activeDeck}
                onActiveDeckChange={(deck) => void switchActiveDeck(deck)}
                secondDeckEnabled={state.secondDeckEnabled}
                masterVolume={state.masterVolume}
                onMasterVolumeChange={(v) =>
                  dispatch({ type: "SET_MASTER_VOLUME", value: v })
                }
                disabled={!playerReady}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto w-full space-y-3">
            {renderDeckPanel("A", "orange")}
            <VolumeSlider
              label="Master"
              orientation="horizontal"
              accent="neutral"
              value={state.masterVolume}
              onChange={(v) =>
                dispatch({ type: "SET_MASTER_VOLUME", value: v })
              }
              disabled={!playerReady}
              className="px-1"
            />
          </div>
        )}

        {state.secondDeckEnabled ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 min-w-0">
            {(["A", "B"] as const).map((deckId) => {
              const deckState = getDeckState(state, deckId);
              return (
                <div key={deckId} className="flex flex-col gap-2 sm:gap-3 min-w-0">
                  {deckState.playQueue.length > 0 && (
                    <PlayQueuePanel
                    deckId={deckId}
                    playQueue={deckState.playQueue}
                    rowStatus={(index) => playQueueRowStatus(state, deckId, index)}
                    onPlayFromRow={(index) =>
                      void handlePlayFromQueueRow(deckId, index)
                    }
                    onRemove={(index) =>
                      void handleRemoveFromPlayQueue(deckId, index)
                    }
                    onMoveUp={(index) =>
                      dispatch({
                        type: "MOVE_PLAY_QUEUE_ITEM",
                        deck: deckId,
                        fromIndex: index,
                        toIndex: index - 1,
                      })
                    }
                    onMoveDown={(index) =>
                      dispatch({
                        type: "MOVE_PLAY_QUEUE_ITEM",
                        deck: deckId,
                        fromIndex: index,
                        toIndex: index + 1,
                      })
                    }
                    afterQueueBehavior={deckState.afterQueueBehavior}
                    onAfterQueueBehaviorChange={(behavior) =>
                      dispatch({
                        type: "SET_AFTER_QUEUE_BEHAVIOR",
                        deck: deckId,
                        behavior,
                      })
                    }
                    afterQueueContinueDeck={deckState.afterQueueContinueDeck}
                    onAfterQueueContinueDeckChange={(targetDeck) =>
                      dispatch({
                        type: "SET_AFTER_QUEUE_CONTINUE_DECK",
                        deck: deckId,
                        targetDeck,
                      })
                    }
                    secondDeckEnabled={state.secondDeckEnabled}
                    highlightedIndex={state.highlightedQueueIndex[deckId]}
                    disabled={!playerReady}
                  />
                  )}
                  <PlaylistPanel
                    deckId={deckId}
                    title={deckState.playlistName}
                    playlist={deckState.playlist}
                    currentPlaylistIndex={
                      deckState.playbackSource === "playlist"
                        ? deckState.playlistIndex
                        : null
                    }
                    rowStatus={(index) => playlistRowStatus(state, deckId, index)}
                    onPlayFromRow={(index) =>
                      void handlePlayFromPlaylistRow(deckId, index)
                    }
                    onAddToQueue={(index) =>
                      void handleAddToPlayQueue(deckId, index)
                    }
                    isInPlayQueue={(trackId) =>
                      isTrackInPlayQueue(state, deckId, trackId)
                    }
                    highlightedIndex={state.highlightedPlaylistIndex[deckId]}
                    totalDurationMs={deckState.playlistTotalDurationMs}
                    disabled={!playerReady}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {state.deckA.playQueue.length > 0 && (
              <PlayQueuePanel
              deckId="A"
              playQueue={state.deckA.playQueue}
              rowStatus={(index) => playQueueRowStatus(state, "A", index)}
              onPlayFromRow={(index) => void handlePlayFromQueueRow("A", index)}
              onRemove={(index) => void handleRemoveFromPlayQueue("A", index)}
              onMoveUp={(index) =>
                dispatch({
                  type: "MOVE_PLAY_QUEUE_ITEM",
                  deck: "A",
                  fromIndex: index,
                  toIndex: index - 1,
                })
              }
              onMoveDown={(index) =>
                dispatch({
                  type: "MOVE_PLAY_QUEUE_ITEM",
                  deck: "A",
                  fromIndex: index,
                  toIndex: index + 1,
                })
              }
              afterQueueBehavior={state.deckA.afterQueueBehavior}
              onAfterQueueBehaviorChange={(behavior) =>
                dispatch({
                  type: "SET_AFTER_QUEUE_BEHAVIOR",
                  deck: "A",
                  behavior,
                })
              }
              afterQueueContinueDeck={state.deckA.afterQueueContinueDeck}
              onAfterQueueContinueDeckChange={(targetDeck) =>
                dispatch({
                  type: "SET_AFTER_QUEUE_CONTINUE_DECK",
                  deck: "A",
                  targetDeck,
                })
              }
              secondDeckEnabled={false}
              highlightedIndex={state.highlightedQueueIndex.A}
              disabled={!playerReady}
            />
            )}
            <PlaylistPanel
              deckId="A"
              title={state.deckA.playlistName}
              playlist={state.deckA.playlist}
              currentPlaylistIndex={
                state.deckA.playbackSource === "playlist"
                  ? state.deckA.playlistIndex
                  : null
              }
              rowStatus={(index) => playlistRowStatus(state, "A", index)}
              onPlayFromRow={(index) => void handlePlayFromPlaylistRow("A", index)}
              onAddToQueue={(index) => void handleAddToPlayQueue("A", index)}
              isInPlayQueue={(trackId) => isTrackInPlayQueue(state, "A", trackId)}
              highlightedIndex={state.highlightedPlaylistIndex.A}
              totalDurationMs={state.deckA.playlistTotalDurationMs}
              disabled={!playerReady}
            />
          </div>
        )}

        <p className="text-[10px] text-neutral-600 text-center pb-2">
          Space play/pause · ← → prev/next · ↑↓ navigate playlist · Enter play
          {state.secondDeckEnabled ? " · A/B switch player" : ""}
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
