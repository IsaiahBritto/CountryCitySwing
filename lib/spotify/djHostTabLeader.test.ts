import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  DJ_HOST_TAB_ACTIVE_KEY,
  DJ_HOST_TAB_ID_KEY,
  heartbeatHostTab,
  isOtherHostTabActive,
} from "@/lib/spotify/djHostTabLeader";

describe("djHostTabLeader", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
    vi.stubGlobal("window", {});
  });

  it("detects another tab when marker is fresh and tab id differs", () => {
    store.set(DJ_HOST_TAB_ID_KEY, "tab-a");
    store.set(
      DJ_HOST_TAB_ACTIVE_KEY,
      JSON.stringify({ tabId: "tab-b", at: Date.now() })
    );

    expect(isOtherHostTabActive()).toBe(true);
  });

  it("does not flag same tab as duplicate host", () => {
    store.set(DJ_HOST_TAB_ID_KEY, "tab-a");
    heartbeatHostTab();

    expect(isOtherHostTabActive()).toBe(false);
  });

  it("ignores stale host tab markers", () => {
    store.set(DJ_HOST_TAB_ID_KEY, "tab-a");
    store.set(
      DJ_HOST_TAB_ACTIVE_KEY,
      JSON.stringify({ tabId: "tab-b", at: Date.now() - 60_000 })
    );

    expect(isOtherHostTabActive()).toBe(false);
  });
});
