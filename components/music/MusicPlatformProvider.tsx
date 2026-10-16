"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DjMusicProvider } from "@/lib/dj/musicProvider";
import { createMusicApiPaths } from "@/lib/music/apiPaths";
import type { MusicProviderSource } from "@/lib/music/platformSettings";

type MusicPlatformContextValue = {
  provider: DjMusicProvider;
  source: MusicProviderSource | null;
  loading: boolean;
  isAppleMusic: boolean;
  refresh: () => Promise<void>;
  apiPaths: ReturnType<typeof createMusicApiPaths>;
};

const MusicPlatformContext = createContext<MusicPlatformContextValue | null>(
  null
);

export function MusicPlatformProvider({
  children,
  initialProvider,
  initialSource,
}: {
  children: ReactNode;
  initialProvider?: DjMusicProvider;
  initialSource?: MusicProviderSource;
}) {
  const [provider, setProvider] = useState<DjMusicProvider>(
    initialProvider ?? "spotify"
  );
  const [source, setSource] = useState<MusicProviderSource | null>(
    initialSource ?? null
  );
  const [loading, setLoading] = useState(!initialProvider);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/music/platform", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        provider?: DjMusicProvider;
        source?: MusicProviderSource;
      };
      if (res.ok && body.provider) {
        setProvider(body.provider);
        setSource(body.source ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialProvider) {
      void refresh();
    }
  }, [initialProvider, refresh]);

  const value = useMemo<MusicPlatformContextValue>(
    () => ({
      provider,
      source,
      loading,
      isAppleMusic: provider === "apple_music",
      refresh,
      apiPaths: createMusicApiPaths(provider),
    }),
    [provider, source, loading, refresh]
  );

  return (
    <MusicPlatformContext.Provider value={value}>
      {children}
    </MusicPlatformContext.Provider>
  );
}

export function useMusicPlatform(): MusicPlatformContextValue {
  const ctx = useContext(MusicPlatformContext);
  if (!ctx) {
    throw new Error("useMusicPlatform must be used within MusicPlatformProvider");
  }
  return ctx;
}

export function useOptionalMusicPlatform(): MusicPlatformContextValue | null {
  return useContext(MusicPlatformContext);
}
