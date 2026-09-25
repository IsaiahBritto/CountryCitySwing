/** Touch target radius around a native range thumb (px). */
export const RANGE_THUMB_HIT_PX = 24;

/** Whether a pointer down within the track is close enough to the thumb to drag. */
export function isPointerNearRangeThumb(
  value: number,
  min: number,
  max: number,
  trackWidthPx: number,
  pointerOffsetXPx: number,
  hitRadiusPx = RANGE_THUMB_HIT_PX
): boolean {
  if (trackWidthPx <= 0 || max <= min) return false;
  const ratio = (value - min) / (max - min);
  const thumbCenterX = ratio * trackWidthPx;
  return Math.abs(pointerOffsetXPx - thumbCenterX) <= hitRadiusPx;
}
