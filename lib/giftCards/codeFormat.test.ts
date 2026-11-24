import { describe, expect, it } from "vitest";
import {
  formatGiftCardCodeBody,
  isCompleteGiftCardCodeBody,
  normalizeGiftCardCodeInput,
} from "@/lib/giftCards/codeFormat";

describe("gift card code formatting", () => {
  it("formats typed input with a dash after 4 chars", () => {
    expect(formatGiftCardCodeBody("cee")).toBe("CEE");
    expect(formatGiftCardCodeBody("ceew")).toBe("CEEW");
    expect(formatGiftCardCodeBody("ceewe")).toBe("CEEW-E");
    expect(formatGiftCardCodeBody("ceewenvz")).toBe("CEEW-ENVZ");
    expect(formatGiftCardCodeBody("ceewenvzxx")).toBe("CEEW-ENVZ");
  });

  it("handles pasted full codes and misplaced dashes", () => {
    expect(formatGiftCardCodeBody("CCS-CEEW-ENVZ")).toBe("CEEW-ENVZ");
    expect(formatGiftCardCodeBody(" ccs-cee-wenvz ")).toBe("CEEW-ENVZ");
    expect(formatGiftCardCodeBody("CEE-WENVZ")).toBe("CEEW-ENVZ");
  });

  it("keeps a body that itself starts with CCS while typing", () => {
    expect(formatGiftCardCodeBody("CCS")).toBe("CCS");
    expect(formatGiftCardCodeBody("CCSA-BCD")).toBe("CCSA-BCD");
    expect(formatGiftCardCodeBody("CCS-CCSA-BCDE")).toBe("CCSA-BCDE");
  });

  it("detects a complete body", () => {
    expect(isCompleteGiftCardCodeBody("CEEW-ENV")).toBe(false);
    expect(isCompleteGiftCardCodeBody("CEEW-ENVZ")).toBe(true);
  });

  it("normalizes generated codes regardless of dash placement", () => {
    expect(normalizeGiftCardCodeInput("CCS-CEE-WENVZ")).toBe("CCS-CEEW-ENVZ");
    expect(normalizeGiftCardCodeInput("ccsceewenvz")).toBe("CCS-CEEW-ENVZ");
    expect(normalizeGiftCardCodeInput("CCS-CEEW-ENVZ")).toBe("CCS-CEEW-ENVZ");
  });

  it("leaves non-standard codes alone apart from case and spaces", () => {
    expect(normalizeGiftCardCodeInput(" holiday 2026 ")).toBe("HOLIDAY2026");
  });
});
