"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline, compBtnSecondary } from "@/lib/comps/buttonStyles";
import { ordinalPlacementLabel } from "@/lib/comps/finalsPlacements";

interface PrizeItem {
  id: string;
  description: string;
  redemptionCode: string | null;
  sortOrder: number;
}

interface PrizeRecipient {
  id: string;
  role: "lead" | "follow";
  firstName: string;
  lastName: string;
  email: string | null;
  emailSentAt: string | null;
  prizesUpdatedAt: string;
  canSend: boolean;
  sendStatus: "ready" | "sent" | "needs_prizes" | "no_email";
  items: PrizeItem[];
}

interface PrizeGroup {
  id: string;
  placement: number;
  sharedPrizes: boolean;
  displayName: string;
  bibNumber: number | null;
  recipients: PrizeRecipient[];
}

interface PrizesPayload {
  finalsReady: boolean;
  competition: { id: string; name: string; comp_type: string };
  nextPlacement: number | null;
  groups: PrizeGroup[];
}

function personLabel(r: PrizeRecipient): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "Unknown";
}

function sendStatusLabel(r: PrizeRecipient): string {
  if (r.sendStatus === "no_email") return "No email on file";
  if (r.sendStatus === "needs_prizes") return "Add at least one prize description";
  if (r.canSend && r.emailSentAt) return "Prizes updated — ready to send";
  if (r.emailSentAt) {
    return `Sent ${new Date(r.emailSentAt).toLocaleString()}`;
  }
  return "Ready to send";
}

export default function PrizesTab({
  competitionId,
}: {
  competitionId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<PrizesPayload | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<PrizeGroup[] | null>(null);

  const SAVE_DEBOUNCE_MS = 3000;

  const load = useCallback(async () => {
    setError(null);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/prizes`);
    if (!res.ok) {
      setError(await apiError(res));
      setLoading(false);
      return;
    }
    setPayload(await res.json());
    setLoading(false);
  }, [competitionId]);

  useEffect(() => {
    load();
  }, [load]);

  const flushSave = useCallback(async () => {
    const groups = pendingPatch.current;
    pendingPatch.current = null;
    if (!groups?.length) return;

    setSaving(true);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/prizes`, {
      method: "PATCH",
      body: JSON.stringify({
        groups: groups.map((g) => ({
          id: g.id,
          sharedPrizes: g.sharedPrizes,
          recipients: g.recipients.map((r) => ({
            id: r.id,
            email: r.email ?? "",
            items: r.items.map((item, index) => ({
              id: item.id,
              description: item.description,
              redemptionCode: item.redemptionCode,
              sortOrder: index,
            })),
          })),
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await apiError(res));
      pendingPatch.current = groups;
      return;
    }
    const data = (await res.json()) as PrizesPayload;
    if (pendingPatch.current) {
      setPayload((prev) => (prev ? { ...data, groups: prev.groups } : data));
    } else {
      setPayload(data);
    }
  }, [competitionId]);

  const scheduleSave = useCallback(
    (groups: PrizeGroup[]) => {
      pendingPatch.current = groups;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave]
  );

  const updateGroups = (updater: (prev: PrizeGroup[]) => PrizeGroup[]) => {
    setPayload((prev) => {
      if (!prev) return prev;
      const nextGroups = updater(prev.groups);
      scheduleSave(nextGroups);
      return { ...prev, groups: nextGroups };
    });
  };

  const updateGroup = (groupId: string, patch: Partial<PrizeGroup>) => {
    updateGroups((groups) =>
      groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
    );
  };

  const updateRecipient = (
    groupId: string,
    recipientId: string,
    patch: Partial<PrizeRecipient>
  ) => {
    updateGroups((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const recipients = g.recipients.map((r) =>
          r.id === recipientId ? { ...r, ...patch } : r
        );
        if (g.sharedPrizes) {
          const lead = recipients.find((r) => r.role === "lead");
          if (lead) {
            return {
              ...g,
              recipients: recipients.map((r) =>
                r.role === "follow" ? { ...r, items: lead.items.map((item) => ({ ...item, id: item.id })) } : r
              ),
            };
          }
        }
        return { ...g, recipients };
      })
    );
  };

  const updateItem = (
    groupId: string,
    recipientId: string,
    itemId: string,
    patch: Partial<PrizeItem>
  ) => {
    updateGroups((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const applyItems = (items: PrizeItem[]) =>
          items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));

        if (g.sharedPrizes) {
          const lead = g.recipients.find((r) => r.role === "lead");
          if (!lead) return g;
          const nextItems = applyItems(lead.items);
          return {
            ...g,
            recipients: g.recipients.map((r) => ({ ...r, items: nextItems.map((i) => ({ ...i })) })),
          };
        }

        return {
          ...g,
          recipients: g.recipients.map((r) =>
            r.id === recipientId ? { ...r, items: applyItems(r.items) } : r
          ),
        };
      })
    );
  };

  const addItemRow = (groupId: string, recipientId: string) => {
    updateGroups((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const newItem: PrizeItem = {
          id: `new-${Date.now()}-${Math.random()}`,
          description: "",
          redemptionCode: null,
          sortOrder: 0,
        };
        if (g.sharedPrizes) {
          const lead = g.recipients.find((r) => r.role === "lead");
          const nextItems = [...(lead?.items ?? []), newItem];
          return {
            ...g,
            recipients: g.recipients.map((r) => ({ ...r, items: nextItems.map((i) => ({ ...i })) })),
          };
        }
        return {
          ...g,
          recipients: g.recipients.map((r) =>
            r.id === recipientId
              ? { ...r, items: [...r.items, newItem] }
              : r
          ),
        };
      })
    );
  };

  const removeItemRow = (
    groupId: string,
    recipientId: string,
    itemId: string
  ) => {
    updateGroups((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const drop = (items: PrizeItem[]) =>
          items.filter((item) => item.id !== itemId);

        if (g.sharedPrizes) {
          const lead = g.recipients.find((r) => r.role === "lead");
          const nextItems = drop(lead?.items ?? []);
          const items =
            nextItems.length > 0
              ? nextItems
              : [
                  {
                    id: `new-${Date.now()}`,
                    description: "",
                    redemptionCode: null,
                    sortOrder: 0,
                  },
                ];
          return {
            ...g,
            recipients: g.recipients.map((r) => ({ ...r, items: items.map((i) => ({ ...i })) })),
          };
        }

        const recipient = g.recipients.find((r) => r.id === recipientId);
        const nextItems = drop(recipient?.items ?? []);
        const items =
          nextItems.length > 0
            ? nextItems
            : [
                {
                  id: `new-${Date.now()}`,
                  description: "",
                  redemptionCode: null,
                  sortOrder: 0,
                },
              ];
        return {
          ...g,
          recipients: g.recipients.map((r) =>
            r.id === recipientId ? { ...r, items } : r
          ),
        };
      })
    );
  };

  const sendOne = async (recipientId: string) => {
    setSendingId(recipientId);
    setError(null);
    setMessage(null);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await flushSave();
    }
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/prizes/recipients/${recipientId}/send`,
      { method: "POST" }
    );
    setSendingId(null);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setMessage("Prize email sent.");
    await load();
  };

  const sendAll = async () => {
    setSendingAll(true);
    setError(null);
    setMessage(null);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await flushSave();
    }
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/prizes/send-all`,
      { method: "POST" }
    );
    setSendingAll(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setPayload(data.payload);
    setMessage(
      `Sent ${data.sent?.length ?? 0} email(s)` +
        (data.failed?.length ? `; ${data.failed.length} failed` : "")
    );
  };

  const addNext = async () => {
    setAdding(true);
    setError(null);
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/prizes/groups`,
      { method: "POST" }
    );
    setAdding(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setPayload(await res.json());
  };

  if (loading) {
    return <p className="text-sm text-neutral-400">Loading prizes…</p>;
  }

  if (!payload?.finalsReady) {
    return (
      <div className="space-y-6">
        <p className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400">
          Competitor names and emails will appear here once finals have been
          tabulated. Prize descriptions can be filled in after results are
          confirmed.
        </p>
        {[1, 2, 3].map((placement) => (
          <section
            key={placement}
            className="rounded-lg border border-neutral-700 bg-neutral-900/30 p-4 opacity-80"
          >
            <h3 className="text-lg font-semibold text-primary">
              {ordinalPlacementLabel(placement)} place
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Awaiting finals results
            </p>
            <div className="mt-4 space-y-2">
              <div className="rounded-md border border-dashed border-neutral-700 bg-neutral-950/30 px-3 py-2 text-sm text-neutral-500">
                Lead — not yet assigned
              </div>
              <div className="rounded-md border border-dashed border-neutral-700 bg-neutral-950/30 px-3 py-2 text-sm text-neutral-500">
                Follow — not yet assigned
              </div>
            </div>
          </section>
        ))}
      </div>
    );
  }

  const sendableCount = payload.groups.reduce(
    (n, g) => n + g.recipients.filter((r) => r.canSend).length,
    0
  );

  const leadRecipient = (g: PrizeGroup) =>
    g.recipients.find((r) => r.role === "lead");
  const followRecipient = (g: PrizeGroup) =>
    g.recipients.find((r) => r.role === "follow");

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {message}
        </p>
      )}
      {saving && (
        <p className="text-xs text-neutral-500">Saving…</p>
      )}

      {payload.groups.map((group) => {
        const lead = leadRecipient(group);
        const follow = followRecipient(group);
        const prizeEditorRecipient = group.sharedPrizes ? lead : lead;

        return (
          <section
            key={group.id}
            className="rounded-lg border border-neutral-700 bg-neutral-900/30 p-4"
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-primary">
                  {ordinalPlacementLabel(group.placement)} place
                </h3>
                <p className="text-sm text-neutral-400">
                  {group.displayName}
                  {group.bibNumber != null ? ` · Bib ${group.bibNumber}` : ""}
                </p>
              </div>
            </div>

            <div className="mb-4 space-y-2">
              {[lead, follow].filter(Boolean).map((recipient) => (
                <div
                  key={recipient!.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-200">
                      {recipient!.role === "lead" ? "Lead" : "Follow"}:{" "}
                      {personLabel(recipient!)}
                    </p>
                    <input
                      type="email"
                      value={recipient!.email ?? ""}
                      onChange={(e) =>
                        updateRecipient(group.id, recipient!.id, {
                          email: e.target.value,
                        })
                      }
                      placeholder="Email address"
                      className="mt-1 w-full max-w-md rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      {sendStatusLabel(recipient!)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!recipient!.canSend || sendingId === recipient!.id}
                    onClick={() => sendOne(recipient!.id)}
                    className={`shrink-0 ${compBtnOutline} disabled:opacity-50`}
                  >
                    {sendingId === recipient!.id
                      ? "Sending…"
                      : recipient!.emailSentAt && !recipient!.canSend
                        ? "Sent"
                        : "Send email"}
                  </button>
                </div>
              ))}
            </div>

            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={group.sharedPrizes}
                onChange={(e) =>
                  updateGroup(group.id, { sharedPrizes: e.target.checked })
                }
                className="rounded border-neutral-600"
              />
              Same prizes for lead &amp; follow
            </label>

            {prizeEditorRecipient && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {group.sharedPrizes ? "Prizes (shared)" : "Lead prizes"}
                </p>
                {prizeEditorRecipient.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(group.id, prizeEditorRecipient.id, item.id, {
                          description: e.target.value,
                        })
                      }
                      placeholder="Prize description"
                      className="min-w-[12rem] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                    />
                    <input
                      type="text"
                      value={item.redemptionCode ?? ""}
                      onChange={(e) =>
                        updateItem(group.id, prizeEditorRecipient.id, item.id, {
                          redemptionCode: e.target.value || null,
                        })
                      }
                      placeholder="Redemption code (optional)"
                      className="min-w-[10rem] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        removeItemRow(group.id, prizeEditorRecipient.id, item.id)
                      }
                      className="rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    addItemRow(group.id, prizeEditorRecipient.id)
                  }
                  className={`${compBtnSecondary} text-sm`}
                >
                  + Add prize row
                </button>
              </div>
            )}

            {!group.sharedPrizes && follow && (
              <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Follow prizes
                </p>
                {follow.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(group.id, follow.id, item.id, {
                          description: e.target.value,
                        })
                      }
                      placeholder="Prize description"
                      className="min-w-[12rem] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                    />
                    <input
                      type="text"
                      value={item.redemptionCode ?? ""}
                      onChange={(e) =>
                        updateItem(group.id, follow.id, item.id, {
                          redemptionCode: e.target.value || null,
                        })
                      }
                      placeholder="Redemption code (optional)"
                      className="min-w-[10rem] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeItemRow(group.id, follow.id, item.id)}
                      className="rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addItemRow(group.id, follow.id)}
                  className={`${compBtnSecondary} text-sm`}
                >
                  + Add prize row
                </button>
              </div>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap gap-3">
        {payload.nextPlacement != null && (
          <button
            type="button"
            disabled={adding}
            onClick={addNext}
            className={compBtnOutline}
          >
            {adding
              ? "Adding…"
              : `+ Add competitor (${ordinalPlacementLabel(payload.nextPlacement)} place)`}
          </button>
        )}
        <button
          type="button"
          disabled={sendableCount === 0 || sendingAll}
          onClick={sendAll}
          className={compBtnOutline}
        >
          {sendingAll
            ? "Sending all…"
            : `Send all prize emails (${sendableCount})`}
        </button>
      </div>
    </div>
  );
}
