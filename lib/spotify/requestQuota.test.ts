import { describe, expect, it } from "vitest";
import {
  defaultRequestLimits,
  parseRequestLimits,
  validateRequestLimits,
} from "@/lib/spotify/requestLimits";
import {
  assertCanRequest,
  getRemainingQuota,
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
});
