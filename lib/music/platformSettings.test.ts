import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

import { supabaseServer } from "@/lib/supabaseServer";
import {
  envMusicProviderOverride,
  getEffectiveMusicProvider,
  invalidateMusicPlatformProviderCache,
  parseMusicProvider,
} from "@/lib/music/platformSettings";

describe("platformSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    invalidateMusicPlatformProviderCache();
    vi.mocked(supabaseServer.from).mockReset();
  });

  it("parseMusicProvider accepts apple-music alias", () => {
    expect(parseMusicProvider("apple-music")).toBe("apple_music");
    expect(parseMusicProvider("spotify")).toBe("spotify");
  });

  it("env override wins over database", async () => {
    vi.stubEnv("MUSIC_PROVIDER", "apple_music");
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { provider: "spotify" }, error: null }),
    };
    vi.mocked(supabaseServer.from).mockReturnValue(chain as never);

    const result = await getEffectiveMusicProvider();
    expect(result).toEqual({ provider: "apple_music", source: "env" });
    expect(supabaseServer.from).not.toHaveBeenCalled();
  });

  it("defaults to spotify when db row missing", async () => {
    expect(envMusicProviderOverride()).toBeNull();
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabaseServer.from).mockReturnValue(chain as never);

    const result = await getEffectiveMusicProvider();
    expect(result.provider).toBe("spotify");
    expect(result.source).toBe("database");
  });
});
