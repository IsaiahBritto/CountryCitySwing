/**
 * Detect entry ids whose list index changed between sort orders.
 */
export function entryIdsWithIndexChange(
  prevOrder: string[],
  nextOrder: string[]
): string[] {
  const prevIndex = new Map(prevOrder.map((id, i) => [id, i]));
  return nextOrder.filter((id, i) => {
    const prev = prevIndex.get(id);
    return prev !== undefined && prev !== i;
  });
}

export const SCORING_ORDER_FADE_MS = 300;
