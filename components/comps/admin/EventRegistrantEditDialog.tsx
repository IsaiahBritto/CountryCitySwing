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
  signupDivisionIds: {
    jnjCompetitionId: string | null;
    strictlyCompetitionId: string | null;
    allAmericanCompetitionId: string | null;
  };
  jnjAssignments?: { competitionId: string; role: "lead" | "follow" }[];
  eventCompetitions: {
    id: string;
    name: string;
    comp_type: string;
    test_comp?: boolean | null;
  }[];
}

export default function EventRegistrantEditDialog({
  eventId,
  person,
  isCommunityEvent = false,
  open,
  onClose,
  onSaved,
}: {
  eventId: string;
  person: EventRegistrantPerson | null;
  isCommunityEvent?: boolean;
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
  const [markingPaid, setMarkingPaid] = useState(false);
  const [jnjRows, setJnjRows] = useState<
    { competitionId: string; role: "lead" | "follow" }[]
  >([]);
  const [strictlyDivisionId, setStrictlyDivisionId] = useState("");
  const [allAmericanDivisionId, setAllAmericanDivisionId] = useState("");

  const anyDivisionLimited =
    detail?.tiersByCompetition.some((t) => t.tier === "limited") ?? false;

  const tierForComp = (competitionId: string) =>
    detail?.tiersByCompetition.find((t) => t.competitionId === competitionId)
      ?.tier ?? "full";

  const strictlyLimited =
    strictlyDivisionId && tierForComp(strictlyDivisionId) === "limited";

  const jnjDivisions = useMemo(
    () =>
      (detail?.eventCompetitions ?? []).filter(
        (c) => c.comp_type === "jack_and_jill" && !c.test_comp
      ),
    [detail]
  );
  const strictlyDivisions = useMemo(
    () =>
      (detail?.eventCompetitions ?? []).filter(
        (c) => c.comp_type === "strictly" && !c.test_comp
      ),
    [detail]
  );
  const allAmericanDivisions = useMemo(
    () =>
      (detail?.eventCompetitions ?? []).filter(
        (c) => c.comp_type === "all_american" && !c.test_comp
      ),
    [detail]
  );

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
      const initialJnJ =
        d.jnjAssignments && d.jnjAssignments.length > 0
          ? d.jnjAssignments.map((a) => ({
              competitionId: a.competitionId,
              role: a.role,
            }))
          : d.signupDivisionIds?.jnjCompetitionId
            ? [
                {
                  competitionId: d.signupDivisionIds.jnjCompetitionId,
                  role: (d.roles.includes("jnj_follow") &&
                  !d.roles.includes("jnj_lead")
                    ? "follow"
                    : "lead") as "lead" | "follow",
                },
              ]
            : [];
      setJnjRows(initialJnJ);
      setStrictlyDivisionId(d.signupDivisionIds?.strictlyCompetitionId ?? "");
      setAllAmericanDivisionId(d.signupDivisionIds?.allAmericanCompetitionId ?? "");
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
    jnj_lead: jnjRows.some((r) => r.role === "lead"),
    jnj_follow: jnjRows.some((r) => r.role === "follow"),
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
          jnjAssignments: jnjRows.map((r) => ({
            competitionId: r.competitionId,
            role: r.role,
          })),
          divisionSelections: {
            jnjCompetitionId: jnjRows[0]?.competitionId || null,
            strictlyCompetitionId: strictlyDivisionId || null,
            allAmericanCompetitionId: allAmericanDivisionId || null,
          },
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
    if (strictlyRoleChanged && !strictlyLimited) {
      setPendingStrictlySwap(true);
      setConfirmSwapOpen(true);
      return;
    }
    void save(false);
  };

  const markPaid = async () => {
    if (!person?.compSignupId || person.paid) return;
    setMarkingPaid(true);
    setError(null);
    const res = await authedFetch(
      `/api/admin/comps/events/${eventId}/registrants`,
      {
        method: "PATCH",
        body: JSON.stringify({
          personKey: person.personKey,
          compSignupId: person.compSignupId,
          markPaid: true,
        }),
      }
    );
    setMarkingPaid(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    onSaved((data.roster ?? []) as EventRegistrantPerson[]);
    onClose();
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

          {anyDivisionLimited && (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              One or more divisions have started scoring — locked divisions allow
              name and email changes only.
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

              {isCommunityEvent && person.compSignupId && (
                <div className="rounded-md border border-neutral-600 bg-neutral-800/50 px-3 py-3">
                  <p className="text-xs font-medium uppercase text-neutral-500">
                    Organizer payment
                  </p>
                  {person.paid ? (
                    <p className="mt-1 text-sm text-green-400">
                      Marked paid
                      {person.selectedPaymentMethodLabel
                        ? ` — ${person.selectedPaymentMethodLabel}`
                        : ""}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-neutral-300">
                        {person.selectedPaymentMethodLabel
                          ? `Method selected: ${person.selectedPaymentMethodLabel}`
                          : "Not marked paid yet."}
                      </p>
                      <button
                        type="button"
                        disabled={markingPaid}
                        onClick={() => void markPaid()}
                        className={`${compBtnOutline} mt-3`}
                      >
                        {markingPaid ? "Saving…" : "Mark paid"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {detail.tiersByCompetition.length > 0 && (
                <ul className="rounded-md border border-neutral-700 bg-neutral-800/40 px-3 py-2 text-xs text-neutral-400">
                  {detail.tiersByCompetition.map((t) => (
                    <li key={t.competitionId}>
                      {t.name}:{" "}
                      {t.tier === "limited" ? "name/email only" : "full edit"}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
                  Divisions
                </p>
                {jnjDivisions.length > 0 && (
                  <div className="mb-3 space-y-3">
                    <p className="text-xs text-neutral-500">Jack &amp; Jill</p>
                    {jnjRows.map((row, idx) => {
                      const rowLimited =
                        row.competitionId &&
                        tierForComp(row.competitionId) === "limited";
                      const usedElsewhere = new Set(
                        jnjRows
                          .filter((_, i) => i !== idx)
                          .map((r) => r.competitionId)
                      );
                      return (
                        <div
                          key={idx}
                          className="rounded-md border border-neutral-700 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-neutral-400">
                              JnJ division {idx + 1}
                            </span>
                            {idx === 1 && !rowLimited && (
                              <button
                                type="button"
                                className="text-xs text-red-400 hover:underline"
                                onClick={() =>
                                  setJnjRows((rows) => rows.filter((_, i) => i !== 1))
                                }
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <select
                            className={inputCls}
                            disabled={!!rowLimited}
                            value={row.competitionId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setJnjRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx ? { ...r, competitionId: v } : r
                                )
                              );
                            }}
                          >
                            <option value="">— Select division —</option>
                            {jnjDivisions.map((c) => (
                              <option
                                key={c.id}
                                value={c.id}
                                disabled={usedElsewhere.has(c.id)}
                              >
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-4 text-sm text-neutral-200">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`jnj-role-${idx}`}
                                disabled={!!rowLimited}
                                checked={row.role === "lead"}
                                onChange={() =>
                                  setJnjRows((rows) =>
                                    rows.map((r, i) =>
                                      i === idx ? { ...r, role: "lead" } : r
                                    )
                                  )
                                }
                              />
                              Lead
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`jnj-role-${idx}`}
                                disabled={!!rowLimited}
                                checked={row.role === "follow"}
                                onChange={() =>
                                  setJnjRows((rows) =>
                                    rows.map((r, i) =>
                                      i === idx ? { ...r, role: "follow" } : r
                                    )
                                  )
                                }
                              />
                              Follow
                            </label>
                          </div>
                        </div>
                      );
                    })}
                    {jnjRows.length === 0 && (
                      <button
                        type="button"
                        className={`${compBtnOutline} text-xs`}
                        onClick={() =>
                          setJnjRows([
                            {
                              competitionId: "",
                              role: "lead",
                            },
                          ])
                        }
                      >
                        Add JnJ division
                      </button>
                    )}
                    {jnjRows.length === 1 &&
                      jnjDivisions.length > 1 && (
                        <button
                          type="button"
                          className={`${compBtnOutline} text-xs`}
                          onClick={() => {
                            const opposite =
                              jnjRows[0]?.role === "lead" ? "follow" : "lead";
                            setJnjRows((rows) => [
                              ...rows,
                              { competitionId: "", role: opposite },
                            ]);
                          }}
                        >
                          Add second JnJ division
                        </button>
                      )}
                  </div>
                )}
                {(roleFlags.strictly_lead || roleFlags.strictly_follow) &&
                  strictlyDivisions.length > 1 && (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs text-neutral-500">
                        Strictly division
                      </label>
                      <select
                        className={inputCls}
                        disabled={!!strictlyLimited}
                        value={strictlyDivisionId}
                        onChange={(e) => setStrictlyDivisionId(e.target.value)}
                      >
                        <option value="">— Select division —</option>
                        {strictlyDivisions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                {allAmericanDivisions.length > 1 &&
                  (roleFlags.jnj_lead || roleFlags.jnj_follow) &&
                  detail.signupDivisionIds.allAmericanCompetitionId && (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs text-neutral-500">
                        All American division
                      </label>
                      <select
                        className={inputCls}
                        disabled={false}
                        value={allAmericanDivisionId}
                        onChange={(e) => setAllAmericanDivisionId(e.target.value)}
                      >
                        <option value="">— Select division —</option>
                        {allAmericanDivisions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                <div className="space-y-2">
                  {(["strictly_lead", "strictly_follow"] as const).map((role) => (
                    <label
                      key={role}
                      className={
                        "flex items-center gap-2 text-sm " +
                        (strictlyLimited ? "text-neutral-500" : "text-neutral-200")
                      }
                    >
                      <input
                        type="checkbox"
                        disabled={!!strictlyLimited}
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
