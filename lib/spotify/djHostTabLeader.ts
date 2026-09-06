import { randomId } from "@/lib/randomId";

export const DJ_HOST_TAB_ACTIVE_KEY = "ccs-dj-host-tab-active";
export const DJ_HOST_TAB_ID_KEY = "ccs-dj-host-tab-id";
export const HOST_TAB_STALE_MS = 10_000;

type HostTabMarker = {
  tabId: string;
  at: number;
};

function getOrCreateHostTabId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(DJ_HOST_TAB_ID_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(DJ_HOST_TAB_ID_KEY, id);
  }
  return id;
}

export function heartbeatHostTab(): void {
  if (typeof window === "undefined") return;
  const marker: HostTabMarker = {
    tabId: getOrCreateHostTabId(),
    at: Date.now(),
  };
  sessionStorage.setItem(DJ_HOST_TAB_ACTIVE_KEY, JSON.stringify(marker));
}

export function isOtherHostTabActive(nowMs: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  const raw = sessionStorage.getItem(DJ_HOST_TAB_ACTIVE_KEY);
  if (!raw) return false;
  try {
    const marker = JSON.parse(raw) as HostTabMarker;
    if (!marker.tabId || typeof marker.at !== "number") return false;
    if (nowMs - marker.at > HOST_TAB_STALE_MS) return false;
    return marker.tabId !== getOrCreateHostTabId();
  } catch {
    return false;
  }
}

export function clearHostTabMarker(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DJ_HOST_TAB_ACTIVE_KEY);
}
