export type ControllerPlaybackSnapshotFields = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
};

export function controllerSnapshotsEqual(
  a: ControllerPlaybackSnapshotFields | null | undefined,
  b: ControllerPlaybackSnapshotFields | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.isPlaying === b.isPlaying &&
    a.positionMs === b.positionMs &&
    a.durationMs === b.durationMs &&
    a.currentTrackUri === b.currentTrackUri
  );
}

/** Reuse the previous object reference when snapshot fields are unchanged. */
export function stabilizeControllerSnapshot(
  prev: ControllerPlaybackSnapshotFields | null,
  next: ControllerPlaybackSnapshotFields | null
): ControllerPlaybackSnapshotFields | null {
  if (controllerSnapshotsEqual(prev, next)) {
    return prev;
  }
  return next;
}
