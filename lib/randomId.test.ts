import { describe, expect, it, vi } from "vitest";
import { randomId } from "@/lib/randomId";

describe("randomId", () => {
  it("uses crypto.randomUUID when available", () => {
    const original = globalThis.crypto?.randomUUID;
    const mockUuid = vi.fn(() => "test-uuid-1234");
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: mockUuid },
      configurable: true,
    });

    expect(randomId()).toBe("test-uuid-1234");
    expect(mockUuid).toHaveBeenCalled();

    if (original) {
      Object.defineProperty(globalThis, "crypto", {
        value: { randomUUID: original },
        configurable: true,
      });
    }
  });

  it("falls back when randomUUID is missing", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
    });

    const id = randomId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    Object.defineProperty(globalThis, "crypto", {
      value: original,
      configurable: true,
    });
  });
});
