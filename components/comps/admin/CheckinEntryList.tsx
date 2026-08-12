"use client";

import { compBtnSecondary } from "@/lib/comps/buttonStyles";

export interface CheckinEntryRow {
  id: string;
  checkin_status: "pending" | "checked_in" | "absent";
  checkin_role?: "lead" | "follow" | null;
  promoted_alternate?: boolean;
  display: {
    bibNumber: number | null;
    displayName: string;
  };
}

export function CheckinEntryList({
  entries,
  disabled,
  onSetStatus,
}: {
  entries: CheckinEntryRow[];
  disabled?: boolean;
  onSetStatus: (roundEntryId: string, status: "checked_in" | "absent") => void;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No entries in this round.</p>;
  }

  return (
    <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2">
      {entries.map((e) => (
        <div
          key={e.id}
          className="rounded-md border border-neutral-700 bg-neutral-800/40 px-3 py-2.5"
        >
          <div className="mb-2 flex min-w-0 items-start gap-2">
            <span className="shrink-0 font-mono text-sm text-neutral-400">
              {e.display.bibNumber != null ? `#${e.display.bibNumber}` : "—"}
            </span>
            <span className="min-w-0 flex-1 text-sm text-white">
              {e.display.displayName}
              {e.promoted_alternate && (
                <span className="ml-1 text-xs text-amber-400">(alt)</span>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSetStatus(e.id, "checked_in")}
              disabled={disabled}
              className={
                "flex min-h-11 flex-1 items-center justify-center rounded-md border text-sm font-semibold transition " +
                (e.checkin_status === "checked_in"
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-neutral-600 text-neutral-300 hover:border-green-500 hover:text-green-400")
              }
            >
              In
            </button>
            <button
              type="button"
              onClick={() => onSetStatus(e.id, "absent")}
              disabled={disabled}
              className={
                "flex min-h-11 flex-1 items-center justify-center rounded-md border text-sm font-semibold transition " +
                (e.checkin_status === "absent"
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-neutral-600 text-neutral-300 hover:border-red-500 hover:text-red-400")
              }
            >
              Out
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PromoteAlternateButton({
  disabled,
  busy,
  onClick,
  label = "Promote next alternate",
  className = "mb-3",
}: {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={compBtnSecondary + " " + className}
    >
      {busy ? "Promoting…" : label}
    </button>
  );
}

export function PromoteAlternateButtons({
  disabled,
  busy,
  onPromoteLead,
  onPromoteFollow,
  showLead = true,
  showFollow = true,
}: {
  disabled?: boolean;
  busy?: boolean;
  onPromoteLead: () => void;
  onPromoteFollow: () => void;
  showLead?: boolean;
  showFollow?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {showLead && (
        <PromoteAlternateButton
          disabled={disabled}
          busy={busy}
          className="mb-0"
          label="Promote next lead alternate"
          onClick={onPromoteLead}
        />
      )}
      {showFollow && (
        <PromoteAlternateButton
          disabled={disabled}
          busy={busy}
          className="mb-0"
          label="Promote next follow alternate"
          onClick={onPromoteFollow}
        />
      )}
    </div>
  );
}
