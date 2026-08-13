"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ccs-judge-show-thumbs";

export function useJudgeShowThumbs() {
  const [showThumbs, setShowThumbsState] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "0") setShowThumbsState(false);
    } catch {
      // ignore
    }
  }, []);

  const setShowThumbs = useCallback((value: boolean) => {
    setShowThumbsState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  return { showThumbs, setShowThumbs };
}
