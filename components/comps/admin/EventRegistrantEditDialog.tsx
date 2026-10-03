"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline, compBtnSecondary } from "@/lib/comps/buttonStyles";
import {
  COMP_DIVISION_LABEL,
  type EventRegistrantPerson,
  type EventRegistrantRole,
} from "@/lib/comps/eventRegistrants";
import ConfirmDialog from "@/components/ConfirmDialog";

const ALL_ROLES: EventRegistrantRole[] = [
  "jnj_lead",
  "jnj_follow",
  "strictly_lead",
  "strictly_follow",
];

interface DetailResponse {
  personKey: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roles: EventRegistrantRole[];
  signupManaged: boolean;
  overallTier: "full" | "limited";
  strictlyPartnerName: string | null;
  tiersByCompetition: { competitionId: string; name: string; tier: string }[];
}

export default function EventRegistrantEditDialog({
  eventId,
  person,
  open,
  onClose,
  onSaved,
}: {
  eventId: string;
  person: EventRegistrantPerson | null;
  open: boolean;
  onClose: () => void;
  onSaved: (roster: EventRegistrantPerson[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleFlags, setRoleFlags] = useState<Record<EventRegistrantRole, boolean>>({
    jnj_lead: false,
    jnj_follow: false,
    strictly_lead: false,
    strictly_follow: false,
  });
  const [refreshPublishedNames, setRefreshPublishedNames] = useState(false);
  const [confirmSwapOpen, setConfirmSwapOpen] = useState(false);
  const [pendingStrictlySwap, setPendingStrictlySwap] = useState(false);

  const limited = detail?.overallTier === "limited";

  useEffect(() => {
    if (!open || !person) return;
    setError(null);
    setLoading(true);
    setDetail(null);
    (async () => {
      const res = await authedFetch(
        `/api/admin/comps/events/${eventId}/registrants?personKey=${encodeURIComponent(person.personKey)}`
      );
      setLoading(false);
      if (!res.ok) {
        setError(await apiError(res));
        return;
      }
      const data = await res.json();
      const d = data.detail as DetailResponse & { strictlyPartnerName?: string | null };
      setDetail({
        ...d,
        strictlyPartnerName: d.strictlyPartnerName ?? null,
      });
      setFirstName(d.firstName || person.firstName);
      setLastName(d.lastName || person.lastName);
      setEmail(d.email ?? "");
      const flags = {} as Record<EventRegistrantRole, boolean>;
      for (const r of ALL_ROLES) {
        flags[r] = d.roles.includes(r);
      }
      setRoleFlags(flags);
      setRefreshPublishedNames(false);
      setPendingStrictlySwap(false);
    })();
  }, [open, person, eventId]);

  const strictlyRoleChanged = useMemo(() => {
    if (!detail) return false;
    const wasLead = detail.roles.includes("strictly_lead");
    const wasFollow = detail.roles.includes("strictly_follow");
    const nowLead = roleFlags.strictly_lead;
    const nowFollow = roleFlags.strictly_follow;
    if (wasFollow && nowLead && !wasLead) return true;
    if (wasLead && nowFollow && !wasFollow) return true;
    return false;
  }, [detail, roleFlags]);

  const inputCls =
    "w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white";

  const buildRolesPayload = () => ({
    jnj_lead: roleFlags.jnj_lead,
    jnj_follow: roleFlags.jnj_follow,
    strictly_lead: roleFlags.strictly_lead,
    strictly_follow: roleFlags.strictly_follow,
  });

  const save = async (strictlySwapLeadFollow: boolean) => {
    if (!person) return;
    setSaving(true);
    setError(null);
    const res = await authedFetch(
      `/api/admin/comps/events/${eventId}/registrants`,
      {
        method: "PATCH",
        body: JSON.stringify({
          personKey: person.personKey,
          identity: {
            firstName,
            lastName,
            email: email.trim() || null,
          },
          roles: buildRolesPayload(),
          strictlySwapLeadFollow,
          refreshPublishedNames,
        }),
      }
    );
    setSaving(false);
    setConfirmSwapOpen(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    onSaved((data.roster ?? []) as EventRegistrantPerson[]);
    onClose();
  };

  const onSubmit = () => {
    if (strictlyRoleChanged && !limited) {
      setPendingStrictlySwap(true);
      setConfirmSwapOpen(true);
      return;
    }
    void save(false);
  };

  if (!open || !person) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
          <h2 className="text-lg font-semibold text-white">Edit competitor</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Updates registration, bib record, and imported competition entries.
          </p>

          {limited && (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Scoring has started or this entry has scores — you can change names
              and emails only. Division and role changes are disabled.
            </p>
          )}

          {!detail?.signupManaged && detail && (
            <p className="mt-3 rounded-md border border-neutral-600 bg-neutral-800/50 px-3 py-2 text-sm text-neutral-300">
              Not linked to an online signup. Name changes apply to competition
              entries only.{" "}
              <Link href="/admin/comps" className="text-primary hover:underline">
                Open division console → Entries
              </Link>{" "}
              for walk-ups.
            </p>
          )}

          {loading && (
            <p className="mt-4 text-sm text-neutral-400">Loading…</p>
          )}

          {error && (
            <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {!loading && detail && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">
                    First name
                  </label>
                  <input
                    className={inputCls}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">
                    Last name
                  </label>
                  <input
                    className={inputCls}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">
                  Email
                </label>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
                  Divisions
                </p>
                <div className="space-y-2">
                  {ALL_ROLES.map((role) => (
                    <label
                      key={role}
                      className={
                        "flex items-center gap-2 text-sm " +
                        (limited ? "text-neutral-500" : "text-neutral-200")
                      }
                    >
                      <input
                        type="checkbox"
                        disabled={limited}
                        checked={roleFlags[role]}
                        onChange={(e) =>
                          setRoleFlags((f) => ({
                            ...f,
                            [role]: e.target.checked,
                          }))
                        }
                      />
                      {COMP_DIVISION_LABEL[role]}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={refreshPublishedNames}
                  onChange={(e) => setRefreshPublishedNames(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Update published result labels to match (does not change
                  placements or scores).
                </span>
              </label>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={compBtnSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving || loading || !detail}
              className={compBtnOutline}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSwapOpen}
        title="Swap Strictly lead and follow?"
        message={
          detail?.strictlyPartnerName
            ? `This will swap lead and follow on the Strictly registration with ${detail.strictlyPartnerName}. The lead wears the event bib. Continue?`
            : "This will swap lead and follow on the Strictly registration. The lead wears the event bib. Continue?"
        }
        confirmLabel="Swap and save"
        destructive
        busy={saving}
        onCancel={() => {
          setConfirmSwapOpen(false);
          setPendingStrictlySwap(false);
        }}
        onConfirm={() => void save(pendingStrictlySwap || strictlyRoleChanged)}
      />
    </>
  );
}
