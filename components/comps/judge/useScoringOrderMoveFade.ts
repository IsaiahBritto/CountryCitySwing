"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayOrder } from "@/lib/scoring/displayOrder";
import {
  entryIdsWithIndexChange,
  SCORING_ORDER_FADE_MS,
} from "@/lib/scoring/scoringOrderMoveFade";

/**
 * In Scoring Order mode, delay list reorder briefly so moved rows fade out
 * at their old position before appearing in the new order.
 */
export function useScoringOrderMoveFade<T extends { entryId: string }>(
  sortedRows: T[],
  displayOrder: DisplayOrder
): { rows: T[]; isFading: (entryId: string) => boolean } {
  const nextOrder = useMemo(
    () => sortedRows.map((r) => r.entryId),
    [sortedRows]
  );

  const [visibleOrder, setVisibleOrder] = useState(nextOrder);
  const [fadingIds, setFadingIds] = useState<Set<string>>(() => new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const visibleOrderRef = useRef(visibleOrder);
  const prevDisplayOrderRef = useRef(displayOrder);
  visibleOrderRef.current = visibleOrder;

  const rowsById = useMemo(
    () => new Map(sortedRows.map((r) => [r.entryId, r])),
    [sortedRows]
  );

  useEffect(() => {
    if (displayOrder !== "score") {
      setVisibleOrder(nextOrder);
      setFadingIds(new Set());
      prevDisplayOrderRef.current = displayOrder;
      return;
    }

    if (prevDisplayOrderRef.current !== "score") {
      setVisibleOrder(nextOrder);
      prevDisplayOrderRef.current = displayOrder;
      return;
    }

    const currentVisible = visibleOrderRef.current;
    const moved = entryIdsWithIndexChange(currentVisible, nextOrder);

    if (moved.length === 0) {
      if (currentVisible.join(",") !== nextOrder.join(",")) {
        setVisibleOrder(nextOrder);
      }
      return;
    }

    setFadingIds(new Set(moved));
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setVisibleOrder(nextOrder);
      setFadingIds(new Set());
    }, SCORING_ORDER_FADE_MS);

    return () => clearTimeout(timeoutRef.current);
  }, [nextOrder, displayOrder]);

  const rows = useMemo(
    () =>
      visibleOrder
        .map((id) => rowsById.get(id))
        .filter((r): r is T => r != null),
    [visibleOrder, rowsById]
  );

  const isFading = (entryId: string) => fadingIds.has(entryId);

  return { rows, isFading };
}
