import { appleMusicAppBuild, appleMusicAppName } from "@/lib/appleMusic/config";
import type { MusicKitInstance } from "@/lib/appleMusic/musicKitTypes";

const MUSIC_KIT_SCRIPT_URL =
  "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

let scriptLoadPromise: Promise<void> | null = null;
let configured = false;

export function loadMusicKitScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MusicKit requires a browser"));
  }
  if (window.MusicKit?.getInstance) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${MUSIC_KIT_SCRIPT_URL}"]`
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = MUSIC_KIT_SCRIPT_URL;
      script.async = true;
      script.onerror = () => reject(new Error("MusicKit script failed to load"));
      document.body.appendChild(script);
    }

    const started = Date.now();
    const tick = () => {
      if (window.MusicKit?.getInstance) {
        resolve();
        return;
      }
      if (Date.now() - started > 20_000) {
        reject(new Error("MusicKit failed to load within timeout"));
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });

  return scriptLoadPromise;
}

export async function configureMusicKit(developerToken: string): Promise<MusicKitInstance> {
  await loadMusicKitScript();
  if (!window.MusicKit) {
    throw new Error("MusicKit is unavailable");
  }
  if (!configured) {
    await window.MusicKit.configure({
      developerToken,
      app: {
        name: appleMusicAppName(),
        build: appleMusicAppBuild(),
      },
    });
    configured = true;
  }
  return window.MusicKit.getInstance();
}

export function resetMusicKitConfigureForTests(): void {
  configured = false;
  scriptLoadPromise = null;
}
