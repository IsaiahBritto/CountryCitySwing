"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import ConfirmDialog from "@/components/ConfirmDialog";

type SignupRow = {
  id: string;
  label: string;
  divisions: string[];
  paid: boolean;
  isTest: boolean;
  createdAt: string | null;
};

export default function HostEventDeleteRegistrantsDialog({
  open,
  eventId,
  eventTitle,
  onClose,
  onEligibilityChange,
}: {
  open: boolean;
  eventId: string;
  eventTitle: string;
  onClose: () => void;
  onEligibilityChange: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SignupRow | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    const res = await authedFetch(`/api/non-ccs-events/${eventId}/registrants`);
    setLoading(false);
    if (!res.ok) {
      setError(await apiError(res));
      setSignups([]);
      return;
    }
    const data = await res.json();
    setSignups(data.signups ?? []);
    setCanDelete(Boolean(data.canDelete));
  }, [eventId, open]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const removeSignup = async (signup: SignupRow) => {
    setRemovingId(signup.id);
    setError(null);
    const res = await authedFetch(`/api/non-ccs-events/${eventId}/registrants`, {
      method: "DELETE",
      body: JSON.stringify({ signupId: signup.id }),
    });
    setRemovingId(null);
    setConfirmTarget(null);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setSignups(data.signups ?? []);
    setCanDelete(Boolean(data.canDelete));
    onEligibilityChange();
  };

  if (!open) return null;

  return (
  <>
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-registrants-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !removingId) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-red-500/35 bg-neutral-900 shadow-2xl">
        <div className="border-b border-red-500/20 bg-gradient-to-b from-red-950/40 to-neutral-900 px-5 py-4">
          <h2 id="delete-registrants-title" className="text-lg font-semibold text-red-200">
            Remove registrations
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Review each signup for{" "}
            <span className="text-neutral-200">{eventTitle || "this event"}</span>. Remove
            everyone you do not want before deleting the event.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading registrations…</p>
          ) : error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : signups.length === 0 ? (
            <p className="text-sm text-neutral-400">
              No active registrations remain. You can close this and delete the event.
            </p>
          ) : (
            <ul className="space-y-3">
              {signups.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!!removingId}
                    onClick={() => setConfirmTarget(s)}
                    className="group w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-950/20 disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-white group-hover:text-red-100">
                          {s.label}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {s.divisions.map((d) => (
                            <span
                              key={d}
                              className="rounded-full border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300"
                            >
                              {d}
                            </span>
                          ))}
                          {s.isTest && (
                            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200/90">
                              Test
                            </span>
                          )}
                          {s.paid ? (
                            <span className="rounded-full border border-green-500/30 px-2 py-0.5 text-xs text-green-300/90">
                              Paid
                            </span>
                          ) : (
                            <span className="rounded-full border border-neutral-600 px-2 py-0.5 text-xs text-neutral-500">
                              Unpaid
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-red-400 opacity-80 group-hover:opacity-100">
                        Remove
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-neutral-800 px-5 py-4 sm:flex-row sm:justify-between sm:items-center">
          <p className="text-xs text-neutral-500">
            {signups.length === 0
              ? "Event can be deleted when the roster is clear."
              : `${signups.length} registration${signups.length === 1 ? "" : "s"} remaining`}
            {canDelete && signups.length > 0 && " · only test signups remain"}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={!!removingId}
            className="rounded-md border border-neutral-600 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {canDelete ? "Done — delete event below" : "Close"}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      open={confirmTarget != null}
      title="Remove this registration?"
      message={`Remove “${confirmTarget?.label ?? "this registration"}” from the event? Division entries for this signup will be deleted. This cannot be undone.`}
      confirmLabel="Remove registration"
      destructive
      busy={removingId != null}
      onConfirm={() => {
        if (confirmTarget) void removeSignup(confirmTarget);
      }}
      onCancel={() => {
        if (!removingId) setConfirmTarget(null);
      }}
    />
  </>
  );
}