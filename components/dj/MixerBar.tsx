"use client";

const FADE_OPTIONS = [
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 },
  { label: "3s", value: 3000 },
  { label: "5s", value: 5000 },
  { label: "8s", value: 8000 },
];

export type MixerBarProps = {
  crossfader: number;
  onCrossfaderChange: (value: number) => void;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  fadeMs: number;
  onFadeMsChange: (ms: number) => void;
  onTransition: () => void;
  isTransitioning: boolean;
  bpm: number | null;
  automixEnabled: boolean;
  onAutomixChange: (value: boolean) => void;
  canTransition: boolean;
  disabled?: boolean;
};

export default function MixerBar({
  crossfader,
  onCrossfaderChange,
  masterVolume,
  onMasterVolumeChange,
  fadeMs,
  onFadeMsChange,
  onTransition,
  isTransitioning,
  bpm,
  automixEnabled,
  onAutomixChange,
  canTransition,
  disabled = false,
}: MixerBarProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-2 min-w-[200px]">
      <div className="text-center">
        <div className="text-3xl font-bold tabular-nums text-neutral-100">
          {bpm ?? "—"}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
          BPM
        </div>
      </div>

      <div className="w-full space-y-2">
        <div className="flex justify-between text-[10px] text-neutral-500 uppercase">
          <span>A</span>
          <span>Crossfader</span>
          <span>B</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crossfader}
          onChange={(e) => onCrossfaderChange(Number(e.target.value))}
          disabled={disabled || isTransitioning}
          className="w-full accent-neutral-300"
          aria-label="Crossfader"
        />
      </div>

      <div className="w-full space-y-1">
        <label className="text-[10px] uppercase text-neutral-500">Master</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(masterVolume * 100)}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value) / 100)}
          disabled={disabled}
          className="w-full accent-neutral-300"
          aria-label="Master volume"
        />
      </div>

      <div className="w-full space-y-1">
        <label className="text-[10px] uppercase text-neutral-500">Fade</label>
        <select
          value={fadeMs}
          onChange={(e) => onFadeMsChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
        >
          {FADE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onTransition}
        disabled={disabled || isTransitioning || !canTransition}
        className="w-full px-4 py-2 rounded-lg bg-neutral-100 text-neutral-900 font-semibold text-sm hover:bg-white disabled:opacity-40"
      >
        {isTransitioning ? "Transitioning…" : "Transition"}
      </button>

      <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
        <input
          type="checkbox"
          checked={automixEnabled}
          onChange={(e) => onAutomixChange(e.target.checked)}
          disabled={disabled}
        />
        Automix this playlist
      </label>
    </div>
  );
}
