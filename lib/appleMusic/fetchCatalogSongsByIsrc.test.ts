import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/appleMusic/apiFetch", () => ({
  appleMusicApiFetch: vi.fn(),
}));

import { appleMusicApiFetch } from "@/lib/appleMusic/apiFetch";
import {
  catalogSongsByIsrcRequestPath,
  fetchCatalogSongsByIsrc,
} from "@/lib/appleMusic/client";

describe("catalogSongsByIsrcRequestPath", () => {
  it("uses filter[isrc] with comma-separated ISRCs", () => {
    const path = catalogSongsByIsrcRequestPath("us", [
      "USQX92102112",
      "USWB12207143",
    ]);
    expect(path).toContain("filter%5Bisrc%5D=");
    expect(path).toContain("USQX92102112%2CUSWB12207143");
    expect(path).not.toContain("filter=isrc");
  });
});

describe("fetchCatalogSongsByIsrc", () => {
  beforeEach(() => {
    vi.mocked(appleMusicApiFetch).mockReset();
    vi.mocked(appleMusicApiFetch).mockResolvedValue({ data: [] });
  });

  it("does not call the API when isrcs is empty", async () => {
    const map = await fetchCatalogSongsByIsrc({
      developerToken: "dev",
      storefront: "us",
      isrcs: [],
    });
    expect(map.size).toBe(0);
    expect(appleMusicApiFetch).not.toHaveBeenCalled();
  });

  it("batches more than 25 ISRCs into two requests", async () => {
    const isrcs = Array.from({ length: 26 }, (_, i) =>
      `USISRC${String(i).padStart(8, "0")}`
    );
    await fetchCatalogSongsByIsrc({
      developerToken: "dev",
      storefront: "us",
      isrcs,
    });
    expect(appleMusicApiFetch).toHaveBeenCalledTimes(2);
    const paths = vi.mocked(appleMusicApiFetch).mock.calls.map((c) => c[0]);
    expect(paths[0]).toContain("filter%5Bisrc%5D=");
    expect(paths[1]).toContain("filter%5Bisrc%5D=");
    const firstBatchCount = decodeURIComponent(
      paths[0].split("filter%5Bisrc%5D=")[1] ?? ""
    ).split(",").length;
    expect(firstBatchCount).toBe(25);
  });
});
