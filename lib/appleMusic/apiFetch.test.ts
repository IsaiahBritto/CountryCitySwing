import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicApiFetchError } from "@/lib/music/apiDiagnostics";

vi.mock("@/lib/music/apiDiagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/music/apiDiagnostics")>();
  return {
    ...actual,
    logMusicApiFailure: vi.fn(),
  };
});

import {
  appleMusicApiFetch,
  parseAppleMusicSuccessJson,
} from "@/lib/appleMusic/apiFetch";

function mockResponse(input: {
  status: number;
  body?: string;
  ok?: boolean;
}): Response {
  const body = input.body ?? "";
  return {
    ok: input.ok ?? (input.status >= 200 && input.status < 300),
    status: input.status,
    headers: new Headers(),
    text: async () => body,
    json: async () => {
      if (body.trim() === "") {
        throw new SyntaxError("Unexpected end of JSON input");
      }
      return JSON.parse(body) as unknown;
    },
  } as Response;
}

describe("parseAppleMusicSuccessJson", () => {
  it("returns undefined for 204", () => {
    expect(parseAppleMusicSuccessJson(204, "")).toBeUndefined();
  });

  it("returns undefined for empty 200 body", () => {
    expect(parseAppleMusicSuccessJson(200, "  ")).toBeUndefined();
  });

  it("parses JSON body", () => {
    expect(parseAppleMusicSuccessJson(200, '{"data":[]}')).toEqual({ data: [] });
  });
});

describe("appleMusicApiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves on 204 with empty body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ status: 204, body: "", ok: true })
    );

    const result = await appleMusicApiFetch<void>(
      "/v1/me/library/playlists/p1/tracks",
      {
        developerToken: "dev",
        musicUserToken: "user",
        method: "POST",
        body: { data: [] },
      }
    );

    expect(result).toBeUndefined();
  });

  it("returns parsed JSON on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ status: 200, body: '{"data":[]}' })
    );

    const result = await appleMusicApiFetch<{ data: unknown[] }>(
      "/v1/catalog/us/songs",
      { developerToken: "dev" }
    );

    expect(result).toEqual({ data: [] });
  });

  it("returns undefined on 200 with empty body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ status: 200, body: "" })
    );

    const result = await appleMusicApiFetch<void>("/v1/me/test", {
      developerToken: "dev",
      method: "DELETE",
    });

    expect(result).toBeUndefined();
  });

  it("throws MusicApiFetchError on 4xx", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () => '{"errors":[{"detail":"bad"}]}',
      json: async () => ({ errors: [{ detail: "bad" }] }),
    } as Response);

    await expect(
      appleMusicApiFetch("/v1/catalog/us/songs", { developerToken: "dev" })
    ).rejects.toBeInstanceOf(MusicApiFetchError);
  });
});
