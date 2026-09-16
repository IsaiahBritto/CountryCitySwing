import {
  findPlaylistIndexByTrackId,
  shufflePlaylistKeepingCurrent,
  type DeckState,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";

export type DeckPlaylistPatch =
  | { op: "replace"; position: number; track: DeckTrack }
  | { op: "append"; track: DeckTrack }
  | { op: "swap"; from: number; to: number }
  | { op: "remove"; position: number }
  | { op: "batch"; patches: DeckPlaylistPatch[] };

function parsePatchTrack(raw: unknown): DeckTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  if (typeof o.uri !== "string" || !o.uri.trim()) return null;
  if (typeof o.name !== "string") return null;
  if (typeof o.primaryArtist !== "string") return null;
  if (typeof o.durationMs !== "number" || !Number.isFinite(o.durationMs)) {
    return null;
  }
  const track: DeckTrack = {
    id: o.id.trim(),
    uri: o.uri.trim(),
    name: o.name,
    primaryArtist: o.primaryArtist,
    durationMs: Math.max(0, o.durationMs),
  };
  if (typeof o.bpm === "number" && Number.isFinite(o.bpm)) {
    track.bpm = o.bpm;
  }
  return track;
}

function parseSingleDeckPlaylistPatch(
  raw: unknown
): Exclude<DeckPlaylistPatch, { op: "batch" }> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.op !== "string") return null;

  switch (o.op) {
    case "replace": {
      const track = parsePatchTrack(o.track);
      if (
        typeof o.position !== "number" ||
        !Number.isInteger(o.position) ||
        o.position < 0 ||
        !track
      ) {
        return null;
      }
      return { op: "replace", position: o.position, track };
    }
    case "append": {
      const track = parsePatchTrack(o.track);
      if (!track) return null;
      return { op: "append", track };
    }
    case "swap":
      if (
        typeof o.from !== "number" ||
        !Number.isInteger(o.from) ||
        o.from < 0 ||
        typeof o.to !== "number" ||
        !Number.isInteger(o.to) ||
        o.to < 0
      ) {
        return null;
      }
      return { op: "swap", from: o.from, to: o.to };
    case "remove":
      if (
        typeof o.position !== "number" ||
        !Number.isInteger(o.position) ||
        o.position < 0
      ) {
        return null;
      }
      return { op: "remove", position: o.position };
    default:
      return null;
  }
}

export function parseDeckPlaylistPatch(raw: unknown): DeckPlaylistPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.op !== "string") return null;

  if (o.op === "batch") {
    if (!Array.isArray(o.patches)) return null;
    const patches: DeckPlaylistPatch[] = [];
    for (const item of o.patches) {
      const patch = parseDeckPlaylistPatch(item);
      if (!patch) return null;
      patches.push(patch);
    }
    return patches.length ? { op: "batch", patches } : null;
  }

  return parseSingleDeckPlaylistPatch(raw);
}

export function remapIndexAfterSwap(
  index: number,
  from: number,
  to: number
): number {
  if (index === from) return to;
  if (index === to) return from;
  return index;
}

export function remapPlayedIndicesAfterSwap(
  played: number[],
  from: number,
  to: number
): number[] {
  return [...new Set(played.map((i) => remapIndexAfterSwap(i, from, to)))].sort(
    (a, b) => a - b
  );
}

export function remapPlayedIndicesAfterRemove(
  played: number[],
  removedIndex: number
): number[] {
  return played
    .filter((i) => i !== removedIndex)
    .map((i) => (i > removedIndex ? i - 1 : i));
}

function remapIndexAfterRemove(index: number | null, removedIndex: number): number | null {
  if (index == null) return null;
  if (index === removedIndex) return null;
  if (index > removedIndex) return index - 1;
  return index;
}

function sumPlaylistDuration(playlist: DeckTrack[]): number {
  return playlist.reduce((sum, t) => sum + t.durationMs, 0);
}

function remapPlayedIndicesByTrackId(
  fromPlaylist: DeckTrack[],
  toPlaylist: DeckTrack[],
  played: number[]
): number[] {
  const ids = new Set(
    played
      .map((i) => fromPlaylist[i]?.id)
      .filter((id): id is string => typeof id === "string")
  );
  const remapped: number[] = [];
  toPlaylist.forEach((track, index) => {
    if (ids.has(track.id)) remapped.push(index);
  });
  return remapped.sort((a, b) => a - b);
}

function remapPlaylistIndexByTrackId(
  fromPlaylist: DeckTrack[],
  toPlaylist: DeckTrack[],
  index: number | null
): number | null {
  if (index == null) return null;
  const trackId = fromPlaylist[index]?.id;
  if (!trackId) return null;
  return findPlaylistIndexByTrackId(toPlaylist, trackId);
}

function filterPlayQueue(playlist: DeckTrack[], playQueue: DeckTrack[]): DeckTrack[] {
  const ids = new Set(playlist.map((t) => t.id));
  return playQueue.filter((t) => ids.has(t.id));
}

function applySinglePatchToLists(
  playlist: DeckTrack[],
  patch: Exclude<DeckPlaylistPatch, { op: "batch" }>
): DeckTrack[] | null {
  const next = [...playlist];

  switch (patch.op) {
    case "replace": {
      if (patch.position < 0 || patch.position >= next.length) return null;
      next[patch.position] = patch.track;
      return next;
    }
    case "append":
      next.push(patch.track);
      return next;
    case "swap": {
      const { from, to } = patch;
      if (
        from < 0 ||
        to < 0 ||
        from >= next.length ||
        to >= next.length ||
        from === to
      ) {
        return null;
      }
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    }
    case "remove": {
      if (patch.position < 0 || patch.position >= next.length) return null;
      next.splice(patch.position, 1);
      return next;
    }
    default:
      return null;
  }
}

function applySinglePatchIndices(
  deck: DeckState,
  playlist: DeckTrack[],
  patch: Exclude<DeckPlaylistPatch, { op: "batch" }>
): Pick<
  DeckState,
  | "playlistIndex"
  | "playlistResumeIndex"
  | "playedPlaylistIndices"
  | "track"
> {
  const currentTrackId = deck.track?.id ?? null;

  switch (patch.op) {
    case "replace": {
      const playlistIndex =
        deck.playlistIndex === patch.position
          ? patch.position
          : deck.playlistIndex;
      const track =
        currentTrackId === patch.track.id
          ? patch.track
          : deck.playlistIndex === patch.position
            ? patch.track
            : deck.track;
      return {
        playlistIndex,
        playlistResumeIndex: deck.playlistResumeIndex,
        playedPlaylistIndices: deck.playedPlaylistIndices,
        track: track ?? deck.track,
      };
    }
    case "append":
      return {
        playlistIndex: deck.playlistIndex,
        playlistResumeIndex: deck.playlistResumeIndex,
        playedPlaylistIndices: deck.playedPlaylistIndices,
        track: deck.track,
      };
    case "swap": {
      const { from, to } = patch;
      return {
        playlistIndex:
          deck.playlistIndex != null
            ? remapIndexAfterSwap(deck.playlistIndex, from, to)
            : null,
        playlistResumeIndex:
          deck.playlistResumeIndex != null
            ? remapIndexAfterSwap(deck.playlistResumeIndex, from, to)
            : null,
        playedPlaylistIndices: remapPlayedIndicesAfterSwap(
          deck.playedPlaylistIndices,
          from,
          to
        ),
        track: deck.track,
      };
    }
    case "remove": {
      const playlistIndex = remapIndexAfterRemove(
        deck.playlistIndex,
        patch.position
      );
      const playlistResumeIndex = remapIndexAfterRemove(
        deck.playlistResumeIndex,
        patch.position
      );
      const removedTrackId = deck.playlist[patch.position]?.id ?? null;
      const trackStillPresent =
        currentTrackId != null &&
        currentTrackId !== removedTrackId &&
        playlist.some((t) => t.id === currentTrackId);
      const track =
        trackStillPresent && currentTrackId
          ? (playlist.find((t) => t.id === currentTrackId) ?? deck.track)
          : playlistIndex != null
            ? (playlist[playlistIndex] ?? null)
            : null;
      return {
        playlistIndex,
        playlistResumeIndex,
        playedPlaylistIndices: remapPlayedIndicesAfterRemove(
          deck.playedPlaylistIndices,
          patch.position
        ),
        track,
      };
    }
    default:
      return {
        playlistIndex: deck.playlistIndex,
        playlistResumeIndex: deck.playlistResumeIndex,
        playedPlaylistIndices: deck.playedPlaylistIndices,
        track: deck.track,
      };
  }
}

function applyPatchesToBasePlaylist(
  deck: DeckState,
  patches: Exclude<DeckPlaylistPatch, { op: "batch" }>[]
): DeckState | null {
  let playlist = [...deck.playlist];
  let playlistIndex = deck.playlistIndex;
  let playlistResumeIndex = deck.playlistResumeIndex;
  let playedPlaylistIndices = [...deck.playedPlaylistIndices];
  let track = deck.track;

  const workingDeck = (): DeckState => ({
    ...deck,
    playlist,
    playlistIndex,
    playlistResumeIndex,
    playedPlaylistIndices,
    track,
  });

  for (const patch of patches) {
    const nextPlaylist = applySinglePatchToLists(playlist, patch);
    if (!nextPlaylist) return null;
    const indices = applySinglePatchIndices(workingDeck(), nextPlaylist, patch);
    playlist = nextPlaylist;
    playlistIndex = indices.playlistIndex;
    playlistResumeIndex = indices.playlistResumeIndex;
    playedPlaylistIndices = indices.playedPlaylistIndices;
    track = indices.track;
  }

  return {
    ...deck,
    playlist,
    playlistTotalDurationMs: sumPlaylistDuration(playlist),
    playlistIndex,
    playlistResumeIndex,
    playedPlaylistIndices,
    track,
    playQueue: filterPlayQueue(playlist, deck.playQueue),
    savedPositionMs: deck.savedPositionMs,
  };
}

function flattenPatches(
  patch: DeckPlaylistPatch
): Exclude<DeckPlaylistPatch, { op: "batch" }>[] {
  if (patch.op === "batch") {
    return patch.patches.flatMap((p) => flattenPatches(p));
  }
  return [patch];
}

export function applyDeckPlaylistPatch(
  deck: DeckState,
  patch: DeckPlaylistPatch
): DeckState {
  const patches = flattenPatches(patch);
  const basePlaylist = deck.shuffleEnabled
    ? (deck.originalPlaylist ?? deck.playlist)
    : deck.playlist;

  const patched = applyPatchesToBasePlaylist(
    { ...deck, playlist: basePlaylist },
    patches
  );
  if (!patched) return deck;

  if (!deck.shuffleEnabled) {
    return patched;
  }

  const originalPlaylist = patched.playlist;
  const { playlist: shuffled, playlistIndex } = shufflePlaylistKeepingCurrent(
    originalPlaylist,
    patched.track?.id ?? null
  );

  return {
    ...patched,
    shuffleEnabled: true,
    originalPlaylist,
    playlist: shuffled,
    playlistIndex,
    playlistResumeIndex: remapPlaylistIndexByTrackId(
      originalPlaylist,
      shuffled,
      patched.playlistResumeIndex
    ),
    playedPlaylistIndices: remapPlayedIndicesByTrackId(
      originalPlaylist,
      shuffled,
      patched.playedPlaylistIndices
    ),
    playQueue: filterPlayQueue(shuffled, patched.playQueue),
  };
}

export function mergePlaylistPreservingPlayback(
  deck: DeckState,
  incomingTracks: DeckTrack[],
  playlistTotalDurationMs: number
): DeckState {
  const fromPlaylist = deck.shuffleEnabled
    ? (deck.originalPlaylist ?? deck.playlist)
    : deck.playlist;

  const currentTrackId = deck.track?.id ?? null;
  const playlistIndex = remapPlaylistIndexByTrackId(
    fromPlaylist,
    incomingTracks,
    deck.playlistIndex
  );
  const playlistResumeIndex = remapPlaylistIndexByTrackId(
    fromPlaylist,
    incomingTracks,
    deck.playlistResumeIndex
  );
  const playedPlaylistIndices = remapPlayedIndicesByTrackId(
    fromPlaylist,
    incomingTracks,
    deck.playedPlaylistIndices
  );

  const track =
    currentTrackId != null
      ? (incomingTracks.find((t) => t.id === currentTrackId) ??
        (playlistIndex != null ? incomingTracks[playlistIndex] ?? null : null))
      : playlistIndex != null
        ? (incomingTracks[playlistIndex] ?? null)
        : null;

  const merged: DeckState = {
    ...deck,
    playlist: incomingTracks,
    playlistTotalDurationMs,
    playlistIndex,
    playlistResumeIndex,
    playedPlaylistIndices,
    track,
    playQueue: filterPlayQueue(incomingTracks, deck.playQueue),
    savedPositionMs: deck.savedPositionMs,
  };

  if (!deck.shuffleEnabled) {
    return merged;
  }

  const originalPlaylist = incomingTracks;
  const { playlist: shuffled, playlistIndex: shuffledIndex } =
    shufflePlaylistKeepingCurrent(originalPlaylist, currentTrackId);

  return {
    ...merged,
    shuffleEnabled: true,
    originalPlaylist,
    playlist: shuffled,
    playlistIndex: shuffledIndex,
    playlistResumeIndex: remapPlaylistIndexByTrackId(
      originalPlaylist,
      shuffled,
      playlistResumeIndex
    ),
    playedPlaylistIndices: remapPlayedIndicesByTrackId(
      originalPlaylist,
      shuffled,
      playedPlaylistIndices
    ),
    playQueue: filterPlayQueue(shuffled, deck.playQueue),
  };
}
