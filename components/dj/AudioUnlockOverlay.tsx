"use client";

type AudioUnlockOverlayProps = {
  onUnlock: () => void;
  loading?: boolean;
  variant?: "default" | "takeover";
};

export default function AudioUnlockOverlay({
  onUnlock,
  loading = false,
  variant = "default",
}: AudioUnlockOverlayProps) {
  const isTakeover = variant === "takeover";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-md mx-4 rounded-xl border border-neutral-600 bg-neutral-900 p-8 text-center space-y-4">
        <h2 className="text-xl font-semibold text-neutral-100">
          {isTakeover ? "Take over playback" : "Enable audio"}
        </h2>
        <p className="text-sm text-neutral-400">
          {isTakeover
            ? "The host device is offline. Click below to connect Spotify on this device and resume playback."
            : "Your browser requires a click before the DJ deck can connect to Spotify and play music through this tab."}
        </p>
        <button
          type="button"
          onClick={onUnlock}
          disabled={loading}
          className="px-6 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold disabled:opacity-50"
        >
          {loading ? "Connecting…" : isTakeover ? "Take over" : "Enable audio"}
        </button>
      </div>
    </div>
  );
}
