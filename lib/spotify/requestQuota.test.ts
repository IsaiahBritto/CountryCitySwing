import { describe, expect, it } from "vitest";
import {
  defaultRequestLimits,
  parseRequestLimits,
  validateRequestLimits,
} from "@/lib/spotify/requestLimits";
import {
  parseRequestRefreshMinutes,
  requestExpiresAtIso,
  rollingWindowCutoffIso,
  validateRequestRefreshMinutes,
} from "@/lib/spotify/requestRefresh";
import {
  assertCanRequest,
  countActiveByGenre,
  filterActiveRequests,
  getRemainingQuota,
  nextAvailableAtForGenre,
} from "@/lib/spotify/requestQuotaLogic";

describe("parseRequestLimits", () => {
  it("parses genre keys", () => {
    expect(parseRequestLimits({ cs: 1, wcs: 2, ld: 0 })).toEqual({
      cs: 1,
      wcs: 2,
      ld: 0,
    });
  });

  it("returns null for invalid input", () => {
    expect(parseRequestLimits("nope")).toBeNull();
    expect(parseRequestLimits({ cs: 1.5 })).toBeNull();
  });
});

describe("validateRequestLimits", () => {
  it("accepts 0-10 for available genres", () => {
    expect(validateRequestLimits({ cs: 0, wcs: 10 }, ["cs", "wcs"])).toEqual({
      cs: 0,
      wcs: 10,
    });
  });

  it("rejects out of range", () => {
    expect(() =>
      validateRequestLimits({ cs: 11 }, ["cs"])
    ).toThrow(/0–10/);
  });
});

describe("defaultRequestLimits", () => {
  it("sets 1 per genre", () => {
    expect(defaultRequestLimits(["cs", "ld"])).toEqual({ cs: 1, ld: 1 });
  });
});

describe("request refresh minutes", () => {
  it("parses allowed values", () => {
    expect(parseRequestRefreshMinutes(15)).toBe(15);
    expect(parseRequestRefreshMinutes(60)).toBe(60);
    expect(parseRequestRefreshMinutes(20)).toBeNull();
  });

  it("validates allowed values", () => {
    expect(validateRequestRefreshMinutes(30)).toBe(30);
    expect(() => validateRequestRefreshMinutes(20)).toThrow(/15, 30, 45, or 60/);
  });
});

describe("rolling window", () => {
  const nowMs = Date.parse("2026-09-14T20:00:00.000Z");

  it("computes cutoff from refresh minutes", () => {
    expect(rollingWindowCutoffIso(nowMs, 30)).toBe(
      "2026-09-14T19:30:00.000Z"
    );
  });

  it("filters expired requests", () => {
    const rows = [
      { genre: "cs" as const, createdAt: "2026-09-14T19:45:00.000Z" },
      { genre: "cs" as const, createdAt: "2026-09-14T19:20:00.000Z" },
    ];
    const active = filterActiveRequests(rows, 30, nowMs);
    expect(active).toHaveLength(1);
    expect(active[0]?.createdAt).toBe("2026-09-14T19:45:00.000Z");
  });

  it("computes request expiry", () => {
    expect(requestExpiresAtIso("2026-09-14T19:45:00.000Z", 15)).toBe(
      "2026-09-14T20:00:00.000Z"
    );
  });
});

describe("nextAvailableAtForGenre", () => {
  const nowMs = Date.parse("2026-09-14T20:00:00.000Z");

  it("returns null when under limit", () => {
    const next = nextAvailableAtForGenre({
      rows: [{ genre: "cs", createdAt: "2026-09-14T19:50:00.000Z" }],
      limit: 2,
      refreshMinutes: 30,
      nowMs,
    });
    expect(next).toBeNull();
  });

  it("returns expiry when at limit", () => {
    const next = nextAvailableAtForGenre({
      rows: [{ genre: "cs", createdAt: "2026-09-14T19:50:00.000Z" }],
      limit: 1,
      refreshMinutes: 30,
      nowMs: Date.parse("2026-09-14T19:55:00.000Z"),
    });
    expect(next).toBe("2026-09-14T20:20:00.000Z");
  });

  it("uses oldest blocking request when limit is 2", () => {
    const next = nextAvailableAtForGenre({
      rows: [
        { genre: "cs", createdAt: "2026-09-14T19:40:00.000Z" },
        { genre: "cs", createdAt: "2026-09-14T19:50:00.000Z" },
      ],
      limit: 2,
      refreshMinutes: 30,
      nowMs,
    });
    expect(next).toBe("2026-09-14T20:10:00.000Z");
  });
});

describe("countActiveByGenre", () => {
  it("counts per genre", () => {
    expect(
      countActiveByGenre(
        [
          { genre: "cs", createdAt: "2026-09-14T19:50:00.000Z" },
          { genre: "wcs", createdAt: "2026-09-14T19:50:00.000Z" },
          { genre: "cs", createdAt: "2026-09-14T19:51:00.000Z" },
        ],
        ["cs", "wcs"]
      )
    ).toEqual({ cs: 2, wcs: 1 });
  });
});

describe("getRemainingQuota", () => {
  it("returns null remaining when unlimited", () => {
    const remaining = getRemainingQuota({
      limits: null,
      used: { cs: 5 },
      availableGenres: ["cs"],
    });
    expect(remaining.cs).toBeNull();
  });

  it("computes remaining capped requests", () => {
    const remaining = getRemainingQuota({
      limits: { cs: 2, ld: 1 },
      used: { cs: 1, ld: 1 },
      availableGenres: ["cs", "ld"],
    });
    expect(remaining).toEqual({ cs: 1, ld: 0 });
  });
});

describe("assertCanRequest", () => {
  it("allows when unlimited", () => {
    expect(() =>
      assertCanRequest({ genre: "cs", limits: null, counts: { cs: 99 } })
    ).not.toThrow();
  });

  it("rejects disabled genre", () => {
    expect(() =>
      assertCanRequest({ genre: "ld", limits: { ld: 0 }, counts: {} })
    ).toThrow(/aren’t open/);
  });

  it("rejects when at cap", () => {
    expect(() =>
      assertCanRequest({
        genre: "cs",
        limits: { cs: 1 },
        counts: { cs: 1 },
      })
    ).toThrow(/Country Swing/);
  });

  it("includes retry time when provided", () => {
    expect(() =>
      assertCanRequest({
        genre: "cs",
        limits: { cs: 1 },
        counts: { cs: 1 },
        nextAvailableAt: { cs: "2026-09-14T20:15:00.000Z" },
      })
    ).toThrow(/Try again after/);
  });
});
