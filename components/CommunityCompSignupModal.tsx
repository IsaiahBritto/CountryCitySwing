"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  DEFAULT_TIME_ZONE,
  formatEventDate,
  formatEventTime,
  getTimeZoneAbbreviation,
} from "@/lib/utils/dateHelpers";
import SignupModalShell from "@/components/SignupModalShell";
import CompLevelBadge from "@/components/CompLevelBadge";
import CompDivisionRadioList, {
  type CompDivisionOption,
} from "@/components/comps/CompDivisionRadioList";
import type { CommunityPaymentMethod } from "@/lib/communityEvents";
import { applyCompDivisionsToState } from "@/lib/comps/applyCompDivisionsToState";

type EventDetail = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  time_zone?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  refund_statement?: string | null;
  community_payment_methods?: CommunityPaymentMethod[];
  community_payment_disclaimer?: string | null;
  community_payment_disclaimer_tone?: string | null;
};

const inputCls =
  "w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white";

export default function CommunityCompSignupModal({
  event,
  initialCompetitions = [],
  open,
  onClose,
}: {
  event: EventDetail | null;
  /** From event detail API — used immediately if comp-divisions fetch fails. */
  initialCompetitions?: CompDivisionOption[];
  open: boolean;
  onClose: () => void;
}) {
  const hasStrictly =
    event && event.strictly_price != null && Number(event.strictly_price) >= 0;
  const hasJnJ = event && event.jnj_price != null && Number(event.jnj_price) >= 0;
  const refundStatement =
    typeof event?.refund_statement === "string" ? event.refund_statement.trim() : "";
  const hasRefundStatement = Boolean(refundStatement);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [prefillDone, setPrefillDone] = useState(false);

  const [strictlySelected, setStrictlySelected] = useState(false);
  const [jnjSelected, setJnJSelected] = useState(false);
  const [strictlyRole, setStrictlyRole] = useState<"lead" | "follow" | "">("");
  const [jnjRole, setJnJRole] = useState<"lead" | "follow" | "">("");
  const [partnerFirstName, setPartnerFirstName] = useState("");
  const [partnerLastName, setPartnerLastName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [paymentId, setPaymentId] = useState("");

  const [acceptLiability, setAcceptLiability] = useState(false);
  const [acceptPayment, setAcceptPayment] = useState(false);
  const [acceptRefund, setAcceptRefund] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState<{
    eventTitle: string;
  } | null>(null);

  const [compDivisions, setCompDivisions] = useState<CompDivisionOption[]>([]);
  const [divisionsLoadError, setDivisionsLoadError] = useState<string | null>(
    null
  );
  const [jnjDivisionId, setJnJDivisionId] = useState("");
  const [strictlyDivisionId, setStrictlyDivisionId] = useState("");
  const [allAmericanDivisionId, setAllAmericanDivisionId] = useState("");
  const [allAmericanSelected, setAllAmericanSelected] = useState(false);

  const jnjDivisionOptions = compDivisions.filter((c) => c.comp_type === "jack_and_jill");
  const strictlyDivisionOptions = compDivisions.filter((c) => c.comp_type === "strictly");
  const allAmericanDivisionOptions = compDivisions.filter(
    (c) => c.comp_type === "all_american"
  );
  const hasAllAmerican = allAmericanDivisionOptions.length > 0;

  const methods = event?.community_payment_methods ?? [];
  const tone = event?.community_payment_disclaimer_tone ?? "neutral";
  const disclaimerClass =
    tone === "danger"
      ? "border-red-500/60 bg-red-500/10 text-red-200"
      : tone === "warning"
        ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-100"
        : "border-neutral-600 bg-neutral-800/80 text-neutral-200";

  const total =
    (strictlySelected && hasStrictly ? Number(event!.strictly_price) || 0 : 0) +
    (jnjSelected && hasJnJ ? Number(event!.jnj_price) || 0 : 0);

  useEffect(() => {
    if (!event || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (cancelled || !session?.user) {
          setPrefillDone(true);
          return;
        }
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("id", session.user.id)
          .maybeSingle();
        if (cancelled || !profile) {
          setPrefillDone(true);
          return;
        }
        setFirstName((prev) => prev || profile.first_name?.trim() || "");
        setLastName((prev) => prev || profile.last_name?.trim() || "");
        setEmail((prev) => prev || profile.email?.trim() || session.user.email || "");
      } finally {
        if (!cancelled) setPrefillDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, event?.id]);

  useEffect(() => {
    if (!open) return;
    setDivisionsLoadError(null);
    if (initialCompetitions.length > 0) {
      applyCompDivisionsToState(initialCompetitions, {
        setCompDivisions,
        setJnJDivisionId,
        setStrictlyDivisionId,
        setAllAmericanDivisionId,
      });
    }
  }, [open, initialCompetitions]);

  useEffect(() => {
    if (!event?.id || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${event.id}/comp-divisions`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (compDivisions.length === 0 && initialCompetitions.length === 0) {
            setDivisionsLoadError(
              data.error || "Could not load competition divisions."
            );
          }
          return;
        }
        setDivisionsLoadError(null);
        const list = (data.competitions ?? []) as CompDivisionOption[];
        applyCompDivisionsToState(list, {
          setCompDivisions,
          setJnJDivisionId,
          setStrictlyDivisionId,
          setAllAmericanDivisionId,
        });
      } catch {
        if (!cancelled) {
          if (compDivisions.length === 0 && initialCompetitions.length === 0) {
            setDivisionsLoadError("Could not load competition divisions.");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compDivisions checked only on fetch failure
  }, [event?.id, open, initialCompetitions.length]);

  useEffect(() => {
    if (!open) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPrefillDone(false);
      setStrictlySelected(false);
      setJnJSelected(false);
      setStrictlyRole("");
      setJnJRole("");
      setPartnerFirstName("");
      setPartnerLastName("");
      setPartnerEmail("");
      setPaymentId("");
      setAcceptLiability(false);
      setAcceptPayment(false);
      setAcceptRefund(false);
      setSubmitError("");
      setSubmitSuccess("");
      setAlreadyRegistered(null);
      setJnJDivisionId("");
      setStrictlyDivisionId("");
      setAllAmericanDivisionId("");
      setAllAmericanSelected(false);
      setCompDivisions([]);
      setDivisionsLoadError(null);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!event || !open) return null;

  const validate = (): string | null => {
    if (!firstName.trim() || !lastName.trim()) return "First and last name are required.";
    if (!email.trim()) return "Email is required.";
    if (!strictlySelected && !jnjSelected && !allAmericanSelected) {
      return "Please select at least one: Strictly, JnJ, or All American.";
    }
    if (strictlySelected && hasStrictly) {
      if (!strictlyRole) return "Strictly: select whether you are Lead or Follow.";
      if (!partnerFirstName.trim() || !partnerLastName.trim()) {
        return "Strictly: partner first and last name are required.";
      }
      if (!partnerEmail.trim()) return "Strictly: partner email is required.";
    }
    if (jnjSelected && hasJnJ) {
      if (!jnjRole) return "JnJ: select whether you are Lead or Follow.";
      if (jnjDivisionOptions.length > 1 && !jnjDivisionId) {
        return "JnJ: choose which division you are entering.";
      }
    }
    if (strictlySelected && hasStrictly && strictlyDivisionOptions.length > 1 && !strictlyDivisionId) {
      return "Strictly: choose which division you are entering.";
    }
    if (allAmericanSelected && allAmericanDivisionOptions.length > 1 && !allAmericanDivisionId) {
      return "All American: choose which division you are entering.";
    }
    if (allAmericanSelected && !jnjSelected && !jnjRole) {
      return "All American: select whether you are Lead or Follow.";
    }
    if (!paymentId) return "Select a payment method.";
    if (!acceptLiability) return "The above is a required field.";
    if (!acceptPayment) return "The above is a required field.";
    if (hasRefundStatement && !acceptRefund) return "The above is a required field.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setAlreadyRegistered(null);
    const err = validate();
    if (err) {
      setSubmitError(err);
      return;
    }
    setIsSubmitting(true);
    try {
      const body = {
        event: {
          id: event.id,
          title: event.title,
          starts_at: event.starts_at,
        },
        registrant: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
        },
        strictly_selected: strictlySelected,
        strictly_role: strictlySelected ? strictlyRole || null : null,
        strictly_partner: strictlySelected
          ? {
              first_name: partnerFirstName.trim(),
              last_name: partnerLastName.trim(),
              email: partnerEmail.trim(),
            }
          : undefined,
        jnj_selected: jnjSelected,
        jnj_role: jnjSelected || allAmericanSelected ? jnjRole || null : null,
        all_american_selected: allAmericanSelected,
        jnj_competition_id: jnjSelected ? jnjDivisionId || null : null,
        strictly_competition_id: strictlySelected ? strictlyDivisionId || null : null,
        all_american_competition_id: allAmericanSelected
          ? allAmericanDivisionId || null
          : null,
        selected_payment_method_id: paymentId,
        accept_liability: acceptLiability,
        accept_payment: acceptPayment,
        accept_refund: hasRefundStatement ? acceptRefund : true,
      };

      const res = await fetch("/api/non-ccs-comp-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyRegistered && data.eventTitle) {
          setAlreadyRegistered({ eventTitle: data.eventTitle });
          return;
        }
        setSubmitError(data.error || "Failed to submit signup");
        return;
      }
      setSubmitSuccess(
        "You're registered! Check your email for details. Pay the organizer using your selected method."
      );
      setTimeout(() => onClose(), 2500);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const tz = event.time_zone || DEFAULT_TIME_ZONE;

  const dateBlock = (
    <p className="text-gray-300 text-sm">
      <strong>Date:</strong> {formatEventDate(event.starts_at, tz)}
      {event.starts_at
        ? ` • ${formatEventTime(event.starts_at, tz)} ${getTimeZoneAbbreviation(event.starts_at, tz)}`
        : ""}
      <br />
      <strong>Location:</strong> {event.location || "—"}
    </p>
  );

  const formBlock = (
    <form id="community-comp-signup-form" onSubmit={onSubmit} className="space-y-4">
      {event.community_payment_disclaimer && (
        <div className={`rounded-md border p-3 text-sm ${disclaimerClass}`}>
          {event.community_payment_disclaimer}
        </div>
      )}

      <p className="text-sm text-neutral-400">
        No CCS account required. We&apos;ll email a confirmation to you (and your
        Strictly partner, if applicable). Your email also prevents duplicate
        registrations.
      </p>

      {!prefillDone && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}

      <div className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
        <p className="text-xs font-medium uppercase text-neutral-500">You</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className={inputCls}
            required
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className={inputCls}
            required
          />
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputCls}
          required
        />
      </div>

      <p className="font-medium text-gray-200">Comp registration — at least one division required</p>
      {divisionsLoadError && (
        <p className="text-sm text-amber-300" role="alert">
          {divisionsLoadError}
        </p>
      )}

      {hasStrictly && (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={strictlySelected}
              onChange={(e) => setStrictlySelected(e.target.checked)}
              className="rounded"
            />
            <span>
              Strictly{" "}
              {event.strictly_price != null && `($${Number(event.strictly_price).toFixed(2)} info)`}
            </span>
            {event.strictly_level && (
              <CompLevelBadge level={event.strictly_level} className="ml-2" />
            )}
          </label>
          {strictlySelected && (
            <div className="ml-6 space-y-4">
              <CompDivisionRadioList
                label="Division"
                name="strictly-division"
                divisions={strictlyDivisionOptions}
                value={strictlyDivisionId}
                onChange={setStrictlyDivisionId}
              />
              <div>
                <p className="text-sm text-gray-300 mb-2">I am the</p>
                <select
                  value={strictlyRole}
                  onChange={(e) => setStrictlyRole(e.target.value as "lead" | "follow")}
                  className={inputCls}
                >
                  <option value="">— Select —</option>
                  <option value="lead">Lead</option>
                  <option value="follow">Follow</option>
                </select>
              </div>
              {strictlyRole && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">Strictly partner</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={partnerFirstName}
                      onChange={(e) => setPartnerFirstName(e.target.value)}
                      placeholder="Partner first name"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={partnerLastName}
                      onChange={(e) => setPartnerLastName(e.target.value)}
                      placeholder="Partner last name"
                      className={inputCls}
                    />
                  </div>
                  <input
                    type="email"
                    value={partnerEmail}
                    onChange={(e) => setPartnerEmail(e.target.value)}
                    placeholder="Partner email"
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasAllAmerican && (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allAmericanSelected}
              onChange={(e) => setAllAmericanSelected(e.target.checked)}
              className="rounded"
            />
            <span>All American</span>
          </label>
          {allAmericanSelected && (
            <div className="ml-6 space-y-3">
              <CompDivisionRadioList
                label="Division"
                name="aa-division"
                divisions={allAmericanDivisionOptions}
                value={allAmericanDivisionId}
                onChange={setAllAmericanDivisionId}
              />
              {!jnjSelected && (
                <>
                  <p className="text-sm text-gray-300">I am a</p>
                  <select
                    value={jnjRole}
                    onChange={(e) => setJnJRole(e.target.value as "lead" | "follow")}
                    className={inputCls}
                  >
                    <option value="">— Select —</option>
                    <option value="lead">Lead</option>
                    <option value="follow">Follow</option>
                  </select>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {hasJnJ && (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={jnjSelected}
              onChange={(e) => setJnJSelected(e.target.checked)}
              className="rounded"
            />
            <span>
              JnJ {event.jnj_price != null && `($${Number(event.jnj_price).toFixed(2)} info)`}
            </span>
            {event.jnj_level && (
              <CompLevelBadge level={event.jnj_level} className="ml-2" />
            )}
          </label>
          {jnjSelected && (
            <div className="ml-6 space-y-3">
              <CompDivisionRadioList
                label="Division"
                name="jnj-division"
                divisions={jnjDivisionOptions}
                value={jnjDivisionId}
                onChange={setJnJDivisionId}
              />
              <p className="text-sm text-gray-300">I am a</p>
              <select
                value={jnjRole}
                onChange={(e) => setJnJRole(e.target.value as "lead" | "follow")}
                className={inputCls}
              >
                <option value="">— Select —</option>
                <option value="lead">Lead</option>
                <option value="follow">Follow</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="font-medium mb-2">Payment method (pay organizer directly)</p>
        <div className="space-y-2">
          {methods.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                paymentId === m.id ? "border-primary bg-primary/10" : "border-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="pay"
                checked={paymentId === m.id}
                onChange={() => setPaymentId(m.id)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-neutral-800 border border-neutral-700">
        <strong>Total (info):</strong> ${total.toFixed(2)}
        <p className="mt-1 text-xs text-neutral-400">
          Country City Swing does not process payment for this event.
        </p>
      </div>

      <div className="bg-neutral-800 p-3 rounded text-sm">
        <p>
          <strong>Liability Release and Assumption of Risk:</strong> I understand and voluntarily
          accept the risks associated with participating in dance activities.
        </p>
      </div>
      <label className="block text-sm">
        <input
          type="checkbox"
          checked={acceptLiability}
          onChange={(e) => setAcceptLiability(e.target.checked)}
          className="mr-2"
        />
        I accept the liability release.
      </label>
      <label className="block text-sm">
        <input
          type="checkbox"
          checked={acceptPayment}
          onChange={(e) => setAcceptPayment(e.target.checked)}
          className="mr-2"
        />
        I understand I must pay the organizer using my selected method; payment is not handled by
        CCS.
      </label>

      {hasRefundStatement && (
        <div className="rounded-lg border border-red-500/50 bg-gradient-to-b from-red-500/10 to-transparent p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">
            Refund policy
          </p>
          <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1">
            {refundStatement}
          </div>
          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptRefund}
              onChange={(e) => setAcceptRefund(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-red-500"
            />
            <span className="text-sm text-gray-300">
              I have read and agree to the refund policy.{" "}
              <span className="text-red-400">*</span>
            </span>
          </label>
        </div>
      )}

      {alreadyRegistered && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/60 bg-amber-950/40 p-4 text-amber-100"
        >
          <p className="font-semibold">Already registered for {alreadyRegistered.eventTitle}</p>
          <p className="mt-1 text-sm">That email is already on the list for this event.</p>
        </div>
      )}
    </form>
  );

  const modalSubmitFooter = (
    <div className="space-y-2">
      {submitError && (
        <p className="text-red-400 text-sm" role="alert">
          {submitError}
        </p>
      )}
      {submitSuccess && <p className="text-green-400 text-sm">{submitSuccess}</p>}
      <button
        type="submit"
        form="community-comp-signup-form"
        disabled={isSubmitting}
        className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] disabled:opacity-50"
      >
        {isSubmitting ? "Submitting..." : "Register"}
      </button>
    </div>
  );

  return (
    <SignupModalShell title={`Sign up — ${event.title}`} onClose={onClose} footer={modalSubmitFooter}>
      {dateBlock}
      {formBlock}
    </SignupModalShell>
  );
}
