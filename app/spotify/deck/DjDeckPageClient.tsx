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
import SessionBar from "@/components/dj/SessionBar";
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
import {
  createPauseActiveHandler,
  executeSessionCommand,
  type DjPlaybackHandlers,
} from "@/lib/spotify/djPlaybackController";
import {
  isDebouncedRemoteDeckAction,
  type RemoteDeckAction,
} from "@/lib/spotify/djDeckActionWire";
import type { DjSessionCommand } from "@/lib/spotify/djSessionCommands";
import { resumeHostFromSnapshot } from "@/lib/spotify/hostSessionResume";
import {
  heartbeatHostTab,
  isOtherHostTabActive,
} from "@/lib/spotify/djHostTabLeader";
import { shouldShowAudioOverlay } from "@/lib/spotify/djSessionSync";
import { useDjSession } from "@/lib/spotify/useDjSession";
import {
  postSessionCommand,
  useSessionCommandChannel,
} from "@/lib/spotify/useSessionCommandChannel";
import { useSpotifyPlayer } from "@/lib/spotify/useSpotifyPlayer";
import { usePlaybackClock } from "@/lib/spotify/usePlaybackClockHook";
import {
  createEmptyPlaybackSnapshot,
  type DjPlaybackSnapshot,
  type DjSessionResponse,
} from "@/lib/spotify/djSession";

const REMOTE_VOLUME_DEBOUNCE_MS = 150;

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
  const [startingSession, setStartingSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [pendingTakeover, setPendingTakeover] = useState(false);

  const [state, dispatch] = useReducer(djDeckReducer, INITIAL_DJ_DECK_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const playbackSnapshotRef = useRef<DjPlaybackSnapshot>(
    createEmptyPlaybackSnapshot()
  );
  const hostDeviceIdRef = useRef<string | null>(null);
  const broadcastCommandRef = useRef<
    (broadcast: import("@/lib/spotify/djSessionCommands").DjSessionCommandBroadcast) => Promise<void>
  >(async () => {});
  const handlersRef = useRef<DjPlaybackHandlers | null>(null);
  const applyRemoteDeckActionRef = useRef<
    ((action: RemoteDeckAction) => Promise<void>) | null
  >(null);
  const remoteDeckDebounceTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const pendingRemoteDeckActionsRef = useRef<Map<string, RemoteDeckAction>>(
    new Map()
  );

  const trackEndTriggeredRef = useRef(false);
  const wasPlayingActiveTrackRef = useRef(false);
  const prevActivePositionRef = useRef(0);
  const lastBackKeyAtRef = useRef(0);
  const crossfadeInProgressRef = useRef(false);
  const crossfadeCancelRef = useRef<(() => void) | null>(null);
  const primedTrackUriRef = useRef<string | null>(null);
  const primeInFlightRef = useRef<string | null>(null);
  const autoPrimeEnabledRef = useRef(true);
  const resumeInProgressRef = useRef(false);
  const pendingHostResumeRef = useRef<DjPlaybackSnapshot | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const getPlaybackSnapshot = useCallback(
    () => playbackSnapshotRef.current,
    []
  );

  const playerPlaybackRef = useRef({
    isPlaying: false,
    currentTrackUri: null as string | null,
  });

  const shouldApplyDeckState = useCallback(
    (incoming: DjSessionResponse) => {
      const incomingUri = getNowPlaying(incoming.deckState)?.uri ?? null;
      const sdkUri = playerPlaybackRef.current.currentTrackUri;
      if (
        incomingUri &&
        sdkUri &&
        !trackUrisMatch(incomingUri, sdkUri)
      ) {
        return false;
      }
      return true;
    },
    []
  );

  const onHostSessionLoaded = useCallback((session: DjSessionResponse) => {
      const snap = session.playbackSnapshot;
      if (snap.currentTrackUri) {
        pendingHostResumeRef.current = snap;
      }
    },
    []
  );

  const djSession = useDjSession({
    authToken,
    enabled: isAdmin && Boolean(authToken) && !loading,
    deckState: state,
    dispatch,
    onError: showToast,
    getPlaybackSnapshot,
    hostDeviceIdRef,
    shouldApplyDeckState,
    onHostSessionLoaded,
  });

  const isControllerMode =
    djSession.isEffectiveRemoteController && !pendingTakeover;

  useEffect(() => {
    if (isControllerMode) {
      setAudioUnlocked(true);
    }
  }, [isControllerMode]);

  useEffect(() => {
    if (djSession.role !== "host" || djSession.session?.status !== "active") {
      return;
    }
    if (isOtherHostTabActive()) {
      return;
    }
    heartbeatHostTab();
    const intervalId = window.setInterval(heartbeatHostTab, 5000);
    return () => window.clearInterval(intervalId);
  }, [djSession.role, djSession.session?.status]);

  const controllerSnapshot = useMemo(() => {
    if (!isControllerMode || !djSession.session) return null;
    const snap = djSession.session.playbackSnapshot;
    const track = getNowPlaying(state);
    return {
      isPlaying: snap.isPlaying,
      positionMs: snap.positionMs,
      durationMs: track?.durationMs ?? 0,
      currentTrackUri: snap.currentTrackUri,
    };
  }, [djSession.session, isControllerMode, state]);

  const player = useSpotifyPlayer({
    authToken,
    enabled: Boolean(
      authToken &&
        (isControllerMode || audioUnlocked || pendingTakeover)
    ),
    mode: isControllerMode ? "controller" : "host",
    controllerSnapshot,
    onPlaybackError: showToast,
    onPlaybackInterrupted: showToast,
  });

  hostDeviceIdRef.current = player.deviceId;
  playerPlaybackRef.current = {
    isPlaying: player.isPlaying,
    currentTrackUri: player.currentTrackUri,
  };

  const activeTrack = useMemo(() => getNowPlaying(state), [state]);
  const activeTrackUri = activeTrack?.uri ?? null;
  const activeDurationMs = activeTrack?.durationMs ?? 0;
  const isSdkOnActiveTrack =
    Boolean(activeTrackUri) &&
    (isControllerMode
      ? trackUrisMatch(
          djSession.session?.playbackSnapshot.currentTrackUri ?? null,
          activeTrackUri
        )
      : trackUrisMatch(player.currentTrackUri, activeTrackUri));
  const isActiveTrackPlaying = isControllerMode
    ? Boolean(
        djSession.session?.playbackSnapshot.isPlaying && isSdkOnActiveTrack
      )
    : player.isPlaying && isSdkOnActiveTrack;

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

  useEffect(() => {
    playbackSnapshotRef.current = {
      isPlaying: isActiveTrackPlaying,
      positionMs: clockPositionMs,
      currentTrackUri: activeTrackUri,
      activeDeck: state.activeDeck,
      updatedAt: new Date().toISOString(),
    };
  }, [
    activeTrackUri,
    clockPositionMs,
    isActiveTrackPlaying,
    state.activeDeck,
  ]);

  useEffect(() => {
    if (isControllerMode && djSession.session?.playbackSnapshot) {
      const snap = djSession.session.playbackSnapshot;
      syncFromSdk(snap.positionMs, snap.isPlaying);
    }
  }, [djSession.session?.playbackSnapshot, isControllerMode, syncFromSdk]);

  const playerStatus = player.status;
  const playerCurrentTrackUri = player.currentTrackUri;
  const playerIsPlaying = player.isPlaying;
  const primeTrack = player.primeTrack;

  const tryPrimeActiveTrack = useCallback(
    async () => {
      if (isControllerMode) return;
      if (resumeInProgressRef.current) return;
      if (!autoPrimeEnabledRef.current) return;
      if (!audioUnlocked || playerStatus !== "ready") return;
      const uri = getNowPlaying(stateRef.current)?.uri ?? null;
      if (!uri) return;
      if (primedTrackUriRef.current === uri) return;
      if (primeInFlightRef.current === uri) return;

      if (
        trackUrisMatch(playerCurrentTrackUri, uri) &&
        !playerIsPlaying
      ) {
        primedTrackUriRef.current = uri;
        return;
      }

      if (playerIsPlaying && trackUrisMatch(playerCurrentTrackUri, uri)) {
        primedTrackUriRef.current = uri;
        return;
      }

      primeInFlightRef.current = uri;
      try {
        await primeTrack(uri);
        primedTrackUriRef.current = uri;
      } catch {
        /* best-effort; user Play still attempts full path */
      } finally {
        if (primeInFlightRef.current === uri) {
          primeInFlightRef.current = null;
        }
      }
    },
    [
      audioUnlocked,
      isControllerMode,
      playerCurrentTrackUri,
      playerIsPlaying,
      playerStatus,
      primeTrack,
    ]
  );

  useEffect(() => {
    if (!activeTrackUri) {
      primedTrackUriRef.current = null;
      primeInFlightRef.current = null;
      return;
    }
    void tryPrimeActiveTrack();
  }, [activeTrackUri, audioUnlocked, playerStatus, tryPrimeActiveTrack]);

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
    if (
      djSession.loading ||
      djSession.role === "controller" ||
      djSession.isEffectiveRemoteController
    ) {
      return;
    }
    setConnectingAudio(true);
    try {
      await player.connect();
      setAudioUnlocked(true);

      const pendingResume =
        pendingHostResumeRef.current ??
        (djSession.role === "host" &&
        djSession.session?.playbackSnapshot.currentTrackUri
          ? djSession.session.playbackSnapshot
          : null);

      if (djSession.role === "host" && pendingResume?.currentTrackUri) {
        resumeInProgressRef.current = true;
        autoPrimeEnabledRef.current = false;
        try {
          await resumeHostFromSnapshot({
            snapshot: pendingResume,
            deckState: stateRef.current,
            player: {
              playUri: player.playUri,
              primeTrack: player.primeTrack,
              seek: player.seek,
            },
            dispatch,
            syncClock: { syncFromSdk },
          });
          trackEndTriggeredRef.current = false;
          pendingHostResumeRef.current = null;
        } catch (resumeErr) {
          showToast(
            resumeErr instanceof Error
              ? resumeErr.message
              : "Failed to resume playback"
          );
        } finally {
          resumeInProgressRef.current = false;
          autoPrimeEnabledRef.current = true;
        }
      } else {
        void tryPrimeActiveTrack();
      }
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
      autoPrimeEnabledRef.current = false;
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
        } else {
          if (sameUri && !player.isPlaying) {
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
          autoPrimeEnabledRef.current = false;
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

  const applyAddToPlayQueue = useCallback(
    async (deck: DeckId, track: DeckTrack) => {
      const current = stateRef.current;
      const deckState = getDeckState(current, deck);
      const wasEmpty = deckState.playQueue.length === 0;
      dispatch({ type: "ADD_TO_PLAY_QUEUE", deck, track });
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

  const applyPlaylistLoaded = useCallback(
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
      if (deck === stateRef.current.activeDeck) {
        void tryPrimeActiveTrack();
      }
    },
    [tryPrimeActiveTrack]
  );

  const applyDisableSecondDeck = useCallback(async () => {
    const current = stateRef.current;
    if (current.activeDeck === "B" && player.isPlaying) {
      cancelCrossfade();
      try {
        await player.pause();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Pause failed");
      }
      pauseClock();
    }

    trackEndTriggeredRef.current = false;
    wasPlayingActiveTrackRef.current = false;
    dispatch({ type: "DISABLE_SECOND_DECK" });
  }, [cancelCrossfade, pauseClock, player, showToast]);

  const djSessionRef = useRef(djSession);
  djSessionRef.current = djSession;

  const sendRemoteDeckAction = useCallback(
    async (action: RemoteDeckAction) => {
      const sess = djSessionRef.current;
      if (!sess.session || sess.role !== "controller") return;
      if (!sess.canExecutePlayback) {
        showToast("Playback host is offline — take over to resume audio.");
        return;
      }
      const result = await postSessionCommand({
        sessionId: sess.session.id,
        clientId: sess.clientId,
        command: { type: "DISPATCH_DECK_ACTION", action },
      });
      if (!result.ok) {
        showToast(result.error ?? "Remote command failed");
        return;
      }
      if (result.broadcast) {
        await broadcastCommandRef.current(result.broadcast);
      }
    },
    [showToast]
  );

  const remoteDeckDebounceKey = useCallback((action: RemoteDeckAction) => {
    if (action.type === "SET_MASTER_VOLUME") return "SET_MASTER_VOLUME";
    if (action.type === "SET_DECK_VOLUME") {
      return `SET_DECK_VOLUME:${action.deck}`;
    }
    if (action.type === "SET_DECK_CROSSFADE") {
      return `SET_DECK_CROSSFADE:${action.deck}`;
    }
    return JSON.stringify(action);
  }, []);

  const runRemoteDeckAction = useCallback(
    async (
      action: RemoteDeckAction,
      localApply: () => void | Promise<void>
    ) => {
      const sess = djSessionRef.current;
      await localApply();

      if (!sess.session || sess.role === "idle" || sess.role === "host") {
        return;
      }
      if (!sess.canExecutePlayback) {
        showToast("Playback host is offline — take over to resume audio.");
        return;
      }

      if (isDebouncedRemoteDeckAction(action)) {
        const key = remoteDeckDebounceKey(action);
        pendingRemoteDeckActionsRef.current.set(key, action);
        const timers = remoteDeckDebounceTimersRef.current;
        const existing = timers.get(key);
        if (existing) clearTimeout(existing);
        timers.set(
          key,
          setTimeout(() => {
            timers.delete(key);
            const latest = pendingRemoteDeckActionsRef.current.get(key);
            pendingRemoteDeckActionsRef.current.delete(key);
            if (latest) void sendRemoteDeckAction(latest);
          }, REMOTE_VOLUME_DEBOUNCE_MS)
        );
        return;
      }

      await sendRemoteDeckAction(action);
    },
    [remoteDeckDebounceKey, sendRemoteDeckAction, showToast]
  );

  const applyRemoteDeckAction = useCallback(
    async (action: RemoteDeckAction) => {
      switch (action.type) {
        case "SET_DECK_VOLUME":
        case "SET_MASTER_VOLUME":
        case "SET_DECK_CROSSFADE":
          dispatch(action);
          applyLiveVolume();
          break;
        case "ADD_TO_PLAY_QUEUE":
          await applyAddToPlayQueue(action.deck, action.track);
          break;
        case "SET_PLAYLIST":
          applyPlaylistLoaded(action.deck, {
            tracks: action.playlist,
            totalDurationMs: action.playlistTotalDurationMs,
          });
          break;
        case "DISABLE_SECOND_DECK":
          await applyDisableSecondDeck();
          break;
        default:
          dispatch(action);
      }
    },
    [
      applyAddToPlayQueue,
      applyDisableSecondDeck,
      applyLiveVolume,
      applyPlaylistLoaded,
    ]
  );

  applyRemoteDeckActionRef.current = applyRemoteDeckAction;

  useEffect(() => {
    const timers = remoteDeckDebounceTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      pendingRemoteDeckActionsRef.current.clear();
    };
  }, []);

  const skipUpNext = useCallback(
    (deck: DeckId) => {
      void runRemoteDeckAction({ type: "SKIP_UP_NEXT", deck }, () => {
        dispatch({ type: "SKIP_UP_NEXT", deck });
      });
    },
    [runRemoteDeckAction]
  );

  const runRemoteDeckActionRef = useRef(runRemoteDeckAction);
  runRemoteDeckActionRef.current = runRemoteDeckAction;

  const dispatchRemoteDeckAction = useCallback((action: RemoteDeckAction) => {
    void runRemoteDeckActionRef.current(action, () => {
      dispatch(action);
    });
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
      const deckState = getDeckState(stateRef.current, deck);
      const trackToAdd = deckState.playlist[index];
      if (!trackToAdd) return;

      const action: RemoteDeckAction = {
        type: "ADD_TO_PLAY_QUEUE",
        deck,
        track: trackToAdd,
      };
      await runRemoteDeckAction(action, () =>
        applyAddToPlayQueue(deck, trackToAdd)
      );
    },
    [applyAddToPlayQueue, runRemoteDeckAction]
  );

  const handleRemoveFromPlayQueue = useCallback(
    (deck: DeckId, index: number) => {
      dispatchRemoteDeckAction({
        type: "REMOVE_FROM_PLAY_QUEUE",
        deck,
        index,
      });
    },
    [dispatchRemoteDeckAction]
  );

  const handlePlaylistChange = useCallback(
    (deck: DeckId, { id, name }: { id: string; name: string }) => {
      dispatchRemoteDeckAction({
        type: "SELECT_PLAYLIST",
        deck,
        playlistId: id,
        playlistName: name,
      });
    },
    [dispatchRemoteDeckAction]
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
      void runRemoteDeckAction(
        {
          type: "SET_PLAYLIST",
          deck,
          playlist: tracks,
          playlistTotalDurationMs: totalDurationMs,
        },
        () => applyPlaylistLoaded(deck, { tracks, totalDurationMs })
      );
    },
    [applyPlaylistLoaded, runRemoteDeckAction]
  );

  const handleRemoveSecondDeck = useCallback(async () => {
    const current = stateRef.current;
    const deckB = getDeckState(current, "B");
    const hasLoadedPlaylist =
      deckB.playlist.length > 0 || deckB.playQueue.length > 0;
    if (
      hasLoadedPlaylist &&
      !window.confirm(
        "Remove Player B? Its playlist and queue will be cleared."
      )
    ) {
      return;
    }

    await runRemoteDeckAction({ type: "DISABLE_SECOND_DECK" }, () =>
      applyDisableSecondDeck()
    );
  }, [applyDisableSecondDeck, runRemoteDeckAction]);

  const runPlaybackCommand = useCallback(
    async (command: DjSessionCommand, local: () => Promise<void>) => {
      const sess = djSessionRef.current;
      if (!sess.session || sess.role === "idle") {
        await local();
        return;
      }
      if (sess.role === "host") {
        await local();
        return;
      }
      if (!sess.canExecutePlayback) {
        showToast("Playback host is offline — take over to resume audio.");
        return;
      }
      const result = await postSessionCommand({
        sessionId: sess.session.id,
        clientId: sess.clientId,
        command,
      });
      if (!result.ok) {
        showToast(result.error ?? "Remote command failed");
        return;
      }
      if (result.broadcast) {
        await broadcastCommandRef.current(result.broadcast);
      }
    },
    [showToast]
  );

  handlersRef.current = {
    playDeck: (deck) => playDeck(deck),
    pauseActive: createPauseActiveHandler(
      () => stateRef.current.activeDeck,
      (deck) => playDeck(deck),
      () => player.isPlaying && isSdkOnActiveTrack
    ),
    advanceTrack: (deck, autoPlay) => advanceTrack(deck, autoPlay),
    previousTrack: (deck) => previousTrack(deck),
    restartTrack: (deck) => restartTrack(deck),
    switchActiveDeck: (deck) => switchActiveDeck(deck),
    seek: (positionMs) => player.seek(positionMs),
    playFromPlaylistRow: (deck, index) => handlePlayFromPlaylistRow(deck, index),
    playFromQueueRow: (deck, index) => handlePlayFromQueueRow(deck, index),
    startQueueHead: (deck, _queueIndex) => startQueueHead(deck, true),
    dispatchDeckAction: (action) => {
      const fn = applyRemoteDeckActionRef.current;
      return fn ? fn(action) : Promise.resolve();
    },
  };

  const { broadcastCommand } = useSessionCommandChannel({
    sessionId: djSession.session?.id ?? null,
    clientId: djSession.clientId,
    enabled: Boolean(djSession.session),
    onCommand:
      djSession.role === "host"
        ? (broadcast) => {
            if (!handlersRef.current) return;
            void executeSessionCommand(broadcast.command, handlersRef.current);
          }
        : undefined,
  });

  broadcastCommandRef.current = broadcastCommand;

  const remotePlayDeck = useCallback(
    (deck: DeckId) => {
      void runPlaybackCommand({ type: "PLAY_DECK", deck }, () => playDeck(deck));
    },
    [playDeck, runPlaybackCommand]
  );

  const remoteAdvanceTrack = useCallback(
    (deck: DeckId, autoPlay: boolean) => {
      void runPlaybackCommand(
        { type: "ADVANCE_TRACK", deck, autoPlay },
        () => advanceTrack(deck, autoPlay)
      );
    },
    [advanceTrack, runPlaybackCommand]
  );

  const remotePreviousTrack = useCallback(
    (deck: DeckId) => {
      void runPlaybackCommand(
        { type: "PREVIOUS_TRACK", deck },
        () => previousTrack(deck)
      );
    },
    [previousTrack, runPlaybackCommand]
  );

  const remoteRestartTrack = useCallback(
    (deck: DeckId) => {
      void runPlaybackCommand(
        { type: "RESTART_TRACK", deck },
        () => restartTrack(deck)
      );
    },
    [restartTrack, runPlaybackCommand]
  );

  const remoteSwitchActiveDeck = useCallback(
    (deck: DeckId) => {
      void runPlaybackCommand(
        { type: "SWITCH_ACTIVE_DECK", deck },
        () => switchActiveDeck(deck)
      );
    },
    [runPlaybackCommand, switchActiveDeck]
  );

  const remotePlayFromPlaylistRow = useCallback(
    (deck: DeckId, index: number) => {
      void runPlaybackCommand(
        { type: "PLAY_PLAYLIST_INDEX", deck, index },
        () => handlePlayFromPlaylistRow(deck, index)
      );
    },
    [handlePlayFromPlaylistRow, runPlaybackCommand]
  );

  const remotePlayFromQueueRow = useCallback(
    (deck: DeckId, index: number) => {
      void runPlaybackCommand(
        { type: "PLAY_QUEUE_INDEX", deck, index },
        () => handlePlayFromQueueRow(deck, index)
      );
    },
    [handlePlayFromQueueRow, runPlaybackCommand]
  );

  const handleStartSession = useCallback(async () => {
    setStartingSession(true);
    const ok = await djSession.startSession();
    setStartingSession(false);
    if (ok) showToast("Session started");
  }, [djSession, showToast]);

  const handleEndSession = useCallback(async () => {
    if (djSession.role === "host" && player.isPlaying) {
      try {
        await player.pause();
      } catch {
        /* best-effort pause before ending */
      }
      pauseClock();
    }
    setEndingSession(true);
    await djSession.endSession();
    setEndingSession(false);
  }, [djSession, pauseClock, player]);

  const handleTakeoverUnlock = useCallback(async () => {
    setConnectingAudio(true);
    try {
      await player.connect();
      setAudioUnlocked(true);
      if (!player.deviceId) {
        throw new Error("Player device not ready");
      }
      setTakingOver(true);
      const snap = djSession.session?.playbackSnapshot;
      const ok = await djSession.takeoverSession(player.deviceId);
      setTakingOver(false);
      setPendingTakeover(false);
      if (!ok) return;
      if (snap?.currentTrackUri) {
        await resumeHostFromSnapshot({
          snapshot: snap,
          deckState: stateRef.current,
          player: {
            playUri: player.playUri,
            primeTrack: player.primeTrack,
            seek: player.seek,
          },
          dispatch,
          syncClock: { syncFromSdk },
        });
        trackEndTriggeredRef.current = false;
      }
      showToast("You are now hosting playback");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Takeover failed");
    } finally {
      setConnectingAudio(false);
      setTakingOver(false);
    }
  }, [djSession, player, showToast]);

  useEffect(() => {
    if (isControllerMode) return;

    const endDetectionUri = player.currentTrackUri ?? activeTrackUri;
    if (!endDetectionUri) {
      wasPlayingActiveTrackRef.current = false;
      return;
    }

    let endDurationMs = activeDurationMs;
    if (!trackUrisMatch(endDetectionUri, activeTrackUri)) {
      const deck = stateRef.current;
      const deckState = getDeckState(deck, deck.activeDeck);
      const matchedTrack =
        (deckState.track &&
        trackUrisMatch(deckState.track.uri, endDetectionUri)
          ? deckState.track
          : null) ??
        deckState.playlist.find((t) => trackUrisMatch(t.uri, endDetectionUri)) ??
        deckState.playQueue.find((t) => trackUrisMatch(t.uri, endDetectionUri));
      endDurationMs = matchedTrack?.durationMs ?? activeDurationMs;
    }

    if (endDurationMs <= 0) {
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
        ? isNearTrackEnd(positionMs, endDurationMs, fadeMs)
        : positionMs >= endDurationMs - endThresholdMs);
    const endedNaturally =
      wasPlaying &&
      !player.isPlaying &&
      (positionMs >= endDurationMs - endThresholdMs ||
        prevActivePositionRef.current >= endDurationMs - endThresholdMs);

    prevActivePositionRef.current = positionMs;

    if ((nearEndWhilePlaying || endedNaturally) && !trackEndTriggeredRef.current) {
      trackEndTriggeredRef.current = true;
      void remoteAdvanceTrack(stateRef.current.activeDeck, true);
    }

    if (positionMs < endDurationMs - Math.max(endThresholdMs, 2000)) {
      trackEndTriggeredRef.current = false;
    }
  }, [
    activeDurationMs,
    activeTrackUri,
    clockPositionMs,
    isControllerMode,
    player.currentTrackUri,
    player.isPlaying,
    player.positionMs,
    remoteAdvanceTrack,
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
          void remotePlayDeck(activeDeck);
          break;
        case "ArrowLeft": {
          e.preventDefault();
          const now = Date.now();
          if (now - lastBackKeyAtRef.current < 400) {
            lastBackKeyAtRef.current = 0;
            void remotePreviousTrack(activeDeck);
          } else {
            lastBackKeyAtRef.current = now;
            void remoteRestartTrack(activeDeck);
          }
          break;
        }
        case "ArrowRight":
          e.preventDefault();
          void remoteAdvanceTrack(activeDeck, true);
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
          void remotePlayFromPlaylistRow(activeDeck, highlighted);
          break;
        case "a":
        case "A":
          if (current.secondDeckEnabled) {
            void remoteSwitchActiveDeck("A");
          }
          break;
        case "b":
        case "B":
          if (current.secondDeckEnabled) {
            void remoteSwitchActiveDeck("B");
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    remoteAdvanceTrack,
    remotePlayDeck,
    remotePlayFromPlaylistRow,
    remotePreviousTrack,
    remoteRestartTrack,
    remoteSwitchActiveDeck,
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
        onPlayPause={() => remotePlayDeck(deckId)}
        onRestartTrack={() => remoteRestartTrack(deckId)}
        onPreviousTrack={() => remotePreviousTrack(deckId)}
        onSkipCurrent={() => remoteAdvanceTrack(deckId, isActive)}
        onSkipUpNext={() => skipUpNext(deckId)}
        volume={state.deckVolume[deckId]}
        onVolumeChange={(v) =>
          dispatchRemoteDeckAction({
            type: "SET_DECK_VOLUME",
            deck: deckId,
            value: v,
          })
        }
        crossfadeSeconds={state.deckCrossfadeSeconds[deckId]}
        onCrossfadeChange={(seconds) =>
          dispatchRemoteDeckAction({
            type: "SET_DECK_CROSSFADE",
            deck: deckId,
            seconds,
          })
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
              disableAutoLoad={djSession.session?.status === "active"}
              tracksLoaded={deckState.playlist.length > 0}
            />
          ) : undefined
        }
      />
    );
  };

  if (loading || djSession.loading) {
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

  const needsOverlay = shouldShowAudioOverlay({
    role: djSession.role,
    isControllerMode,
    pendingTakeover,
    audioUnlocked,
    playerReady: player.status === "ready",
    spotifyConnected: Boolean(spotifyStatus?.connected),
    needsDeckReconnect: Boolean(spotifyStatus?.needsDeckReconnect),
    isPremium: spotifyStatus?.product === "premium",
    sessionLoading: djSession.loading,
  });

  return (
    <>
      {needsOverlay && (
        <AudioUnlockOverlay
          onUnlock={() =>
            void (pendingTakeover ? handleTakeoverUnlock() : handleUnlockAudio())
          }
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
                onClick={() =>
                  dispatchRemoteDeckAction({ type: "ENABLE_SECOND_DECK" })
                }
                className="px-3 py-1.5 rounded-lg border border-neutral-600 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              >
                + Add another playlist
              </button>
            )}
            {state.secondDeckEnabled && (
              <button
                type="button"
                onClick={() => void handleRemoveSecondDeck()}
                className="px-3 py-1.5 rounded-lg border border-neutral-600 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              >
                Remove Player B
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

        <SessionBar
          role={isControllerMode ? "controller" : djSession.role}
          hostStatus={djSession.hostStatus}
          sessionActive={djSession.session?.status === "active"}
          audioUnlocked={audioUnlocked}
          starting={startingSession}
          ending={endingSession}
          takingOver={takingOver}
          onStartSession={() => void handleStartSession()}
          onEndSession={() => void handleEndSession()}
          onTakeover={() => setPendingTakeover(true)}
        />

        {isControllerMode && (
          <p className="text-xs text-sky-300/80">
            Audio is playing on another device — controls apply to the remote
            host.
          </p>
        )}

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
                onActiveDeckChange={(deck) => remoteSwitchActiveDeck(deck)}
                secondDeckEnabled={state.secondDeckEnabled}
                masterVolume={state.masterVolume}
                onMasterVolumeChange={(v) =>
                  dispatchRemoteDeckAction({ type: "SET_MASTER_VOLUME", value: v })
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
                dispatchRemoteDeckAction({ type: "SET_MASTER_VOLUME", value: v })
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
                      void remotePlayFromQueueRow(deckId, index)
                    }
                    onRemove={(index) =>
                      void handleRemoveFromPlayQueue(deckId, index)
                    }
                    onMoveUp={(index) =>
                      dispatchRemoteDeckAction({
                        type: "MOVE_PLAY_QUEUE_ITEM",
                        deck: deckId,
                        fromIndex: index,
                        toIndex: index - 1,
                      })
                    }
                    onMoveDown={(index) =>
                      dispatchRemoteDeckAction({
                        type: "MOVE_PLAY_QUEUE_ITEM",
                        deck: deckId,
                        fromIndex: index,
                        toIndex: index + 1,
                      })
                    }
                    afterQueueBehavior={deckState.afterQueueBehavior}
                    onAfterQueueBehaviorChange={(behavior) =>
                      dispatchRemoteDeckAction({
                        type: "SET_AFTER_QUEUE_BEHAVIOR",
                        deck: deckId,
                        behavior,
                      })
                    }
                    afterQueueContinueDeck={deckState.afterQueueContinueDeck}
                    onAfterQueueContinueDeckChange={(targetDeck) =>
                      dispatchRemoteDeckAction({
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
                      void remotePlayFromPlaylistRow(deckId, index)
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
              onPlayFromRow={(index) => void remotePlayFromQueueRow("A", index)}
              onRemove={(index) => void handleRemoveFromPlayQueue("A", index)}
              onMoveUp={(index) =>
                dispatchRemoteDeckAction({
                  type: "MOVE_PLAY_QUEUE_ITEM",
                  deck: "A",
                  fromIndex: index,
                  toIndex: index - 1,
                })
              }
              onMoveDown={(index) =>
                dispatchRemoteDeckAction({
                  type: "MOVE_PLAY_QUEUE_ITEM",
                  deck: "A",
                  fromIndex: index,
                  toIndex: index + 1,
                })
              }
              afterQueueBehavior={state.deckA.afterQueueBehavior}
              onAfterQueueBehaviorChange={(behavior) =>
                dispatchRemoteDeckAction({
                  type: "SET_AFTER_QUEUE_BEHAVIOR",
                  deck: "A",
                  behavior,
                })
              }
              afterQueueContinueDeck={state.deckA.afterQueueContinueDeck}
              onAfterQueueContinueDeckChange={(targetDeck) =>
                dispatchRemoteDeckAction({
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
              onPlayFromRow={(index) => void remotePlayFromPlaylistRow("A", index)}
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
