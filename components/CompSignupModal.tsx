"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DEFAULT_TIME_ZONE, formatEventDate, formatEventTime, getTimeZoneAbbreviation } from "@/lib/utils/dateHelpers";
import SignupModalShell from "@/components/SignupModalShell";
import ChoiceCards from "@/components/ChoiceCards";

type CompEvent = {
  id: string | number;
  title: string;
  starts_at: string;
  location?: string;
  signupLink?: string;
  signup_link?: string;
  strictly_price?: number | null;
  jnj_price?: number | null;
  refund_statement?: string | null;
  refundStatement?: string | null;
};

type PaymentMethod = "Stripe" | "Cash";

const ROLE_LEAD = "lead";
const ROLE_FOLLOW = "follow";

export default function CompSignupModal({
  event,
  open,
  onClose,
  embedded = false,
}: {
  event: CompEvent | null;
  open: boolean;
  onClose: () => void;
  /** When true, render only the link + form (no modal wrapper). Use inside another overlay to avoid nested modals. */
  embedded?: boolean;
}) {
  const hasStrictly = event && event.strictly_price != null && Number(event.strictly_price) >= 0;
  const hasJnJ = event && event.jnj_price != null && Number(event.jnj_price) >= 0;
  const howsMyDancingUrl = event?.signupLink || event?.signup_link || "";
  const refundStatement =
    (typeof event?.refund_statement === "string" && event.refund_statement.trim()) ||
    (typeof event?.refundStatement === "string" && event.refundStatement.trim()) ||
    "";
  const hasRefundStatement = Boolean(refundStatement);

  const [strictlySelected, setStrictlySelected] = useState(false);
  const [jnjSelected, setJnJSelected] = useState(false);
  const [strictlyRole, setStrictlyRole] = useState<"lead" | "follow" | "">("");
  const [jnjRole, setJnJRole] = useState<"lead" | "follow" | "">("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Stripe");

  const [strictlyLeadFirst, setStrictlyLeadFirst] = useState("");
  const [strictlyLeadLast, setStrictlyLeadLast] = useState("");
  const [strictlyLeadEmail, setStrictlyLeadEmail] = useState("");
  const [strictlyFollowFirst, setStrictlyFollowFirst] = useState("");
  const [strictlyFollowLast, setStrictlyFollowLast] = useState("");
  const [strictlyFollowEmail, setStrictlyFollowEmail] = useState("");

  const [jnjLeadFirst, setJnJLeadFirst] = useState("");
  const [jnjLeadLast, setJnJLeadLast] = useState("");
  const [jnjLeadEmail, setJnJLeadEmail] = useState("");
  const [jnjFollowFirst, setJnJFollowFirst] = useState("");
  const [jnjFollowLast, setJnJFollowLast] = useState("");
  const [jnjFollowEmail, setJnJFollowEmail] = useState("");

  const [userInfo, setUserInfo] = useState<{ first: string; last: string; email: string } | null>(null);

  const [acceptLiability, setAcceptLiability] = useState(false);
  const [acceptPayment, setAcceptPayment] = useState(false);
  const [acceptRefund, setAcceptRefund] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState<{
    eventTitle: string;
    eventDate: string;
  } | null>(null);

  const total =
    (strictlySelected && hasStrictly ? Number(event!.strictly_price) || 0 : 0) +
    (jnjSelected && hasJnJ ? Number(event!.jnj_price) || 0 : 0);

  useEffect(() => {
    if (!event || (!open && !embedded)) return;
    let cancelled = false;
    (async () => {
      setLoadingUser(true);
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (!user || cancelled) return;
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        const first = profile?.first_name || (user.user_metadata?.first_name as string) || "";
        const last = profile?.last_name || (user.user_metadata?.last_name as string) || "";
        const email = (user.email as string) || "";
        if (!cancelled) setUserInfo({ first, last, email });
      } catch (_) {
        if (!cancelled) setUserInfo(null);
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, embedded, event?.id]);

  useEffect(() => {
    if (!userInfo) return;
    if (strictlyRole === ROLE_LEAD) {
      setStrictlyLeadFirst(userInfo.first);
      setStrictlyLeadLast(userInfo.last);
      setStrictlyLeadEmail(userInfo.email);
    } else if (strictlyRole === ROLE_FOLLOW) {
      setStrictlyFollowFirst(userInfo.first);
      setStrictlyFollowLast(userInfo.last);
      setStrictlyFollowEmail(userInfo.email);
    }
  }, [strictlyRole, userInfo]);

  useEffect(() => {
    if (!userInfo) return;
    if (jnjRole === ROLE_LEAD) {
      setJnJLeadFirst(userInfo.first);
      setJnJLeadLast(userInfo.last);
      setJnJLeadEmail(userInfo.email);
    } else if (jnjRole === ROLE_FOLLOW) {
      setJnJFollowFirst(userInfo.first);
      setJnJFollowLast(userInfo.last);
      setJnJFollowEmail(userInfo.email);
    }
  }, [jnjRole, userInfo]);

  useEffect(() => {
    if (!open && !embedded) {
      setStrictlySelected(false);
      setJnJSelected(false);
      setStrictlyRole("");
      setJnJRole("");
      setPaymentMethod("Stripe");
      setStrictlyLeadFirst("");
      setStrictlyLeadLast("");
      setStrictlyLeadEmail("");
      setStrictlyFollowFirst("");
      setStrictlyFollowLast("");
      setStrictlyFollowEmail("");
      setJnJLeadFirst("");
      setJnJLeadLast("");
      setJnJLeadEmail("");
      setJnJFollowFirst("");
      setJnJFollowLast("");
      setJnJFollowEmail("");
      setAcceptLiability(false);
      setAcceptPayment(false);
      setAcceptRefund(false);
      setSubmitError("");
      setSubmitSuccess("");
      setAlreadyRegistered(null);
    }
  }, [open, embedded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validate = (): string | null => {
    if (!strictlySelected && !jnjSelected) return "Please select at least one: Strictly or JnJ.";
    if (strictlySelected && hasStrictly) {
      if (!strictlyLeadFirst?.trim() || !strictlyLeadLast?.trim() || !strictlyLeadEmail?.trim())
        return "Strictly: please fill in Lead first name, last name, and email.";
      if (!strictlyFollowFirst?.trim() || !strictlyFollowLast?.trim() || !strictlyFollowEmail?.trim())
        return "Strictly: please fill in Follow first name, last name, and email.";
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(strictlyLeadEmail) || !emailRe.test(strictlyFollowEmail))
        return "Strictly: please enter valid email addresses.";
    }
    if (jnjSelected && hasJnJ) {
      if (!jnjRole) return "JnJ: please select I am a Lead or I am a Follow.";
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (jnjRole === ROLE_LEAD) {
        if (!jnjLeadFirst?.trim() || !jnjLeadLast?.trim() || !jnjLeadEmail?.trim())
          return "JnJ: please fill in Lead first name, last name, and email.";
        if (!emailRe.test(jnjLeadEmail)) return "JnJ: please enter a valid email.";
      } else {
        if (!jnjFollowFirst?.trim() || !jnjFollowLast?.trim() || !jnjFollowEmail?.trim())
          return "JnJ: please fill in Follow first name, last name, and email.";
        if (!emailRe.test(jnjFollowEmail)) return "JnJ: please enter a valid email.";
      }
    }
    if (!acceptLiability) return "The above is a required field.";
    if (!acceptPayment) return "The above is a required field.";
    if (hasRefundStatement && !acceptRefund) {
      return "The above is a required field.";
    }
    return null;
  };

  const getJnJPayload = () => {
    if (!jnjSelected) {
      return {
        jnj_lead_first_name: null as string | null,
        jnj_lead_last_name: null,
        jnj_lead_email: null,
        jnj_follow_first_name: null,
        jnj_follow_last_name: null,
        jnj_follow_email: null,
      };
    }
    if (jnjRole === ROLE_LEAD) {
      return {
        jnj_lead_first_name: jnjLeadFirst.trim(),
        jnj_lead_last_name: jnjLeadLast.trim(),
        jnj_lead_email: jnjLeadEmail.trim(),
        jnj_follow_first_name: null,
        jnj_follow_last_name: null,
        jnj_follow_email: null,
      };
    }
    if (jnjRole === ROLE_FOLLOW) {
      return {
        jnj_lead_first_name: null,
        jnj_lead_last_name: null,
        jnj_lead_email: null,
        jnj_follow_first_name: jnjFollowFirst.trim(),
        jnj_follow_last_name: jnjFollowLast.trim(),
        jnj_follow_email: jnjFollowEmail.trim(),
      };
    }
    return {
      jnj_lead_first_name: null,
      jnj_lead_last_name: null,
      jnj_lead_email: null,
      jnj_follow_first_name: null,
      jnj_follow_last_name: null,
      jnj_follow_email: null,
    };
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
      const jnjPayload = getJnJPayload();
      const body = {
        event: {
          id: event!.id,
          title: event!.title,
          starts_at: event!.starts_at,
          location: event!.location,
          strictly_price: event!.strictly_price,
          jnj_price: event!.jnj_price,
        },
        strictly_selected: strictlySelected,
        strictly_price: hasStrictly ? event!.strictly_price : null,
        strictly_lead_first_name: strictlySelected ? strictlyLeadFirst.trim() : null,
        strictly_lead_last_name: strictlySelected ? strictlyLeadLast.trim() : null,
        strictly_lead_email: strictlySelected ? strictlyLeadEmail.trim() : null,
        strictly_follow_first_name: strictlySelected ? strictlyFollowFirst.trim() : null,
        strictly_follow_last_name: strictlySelected ? strictlyFollowLast.trim() : null,
        strictly_follow_email: strictlySelected ? strictlyFollowEmail.trim() : null,
        jnj_selected: jnjSelected,
        jnj_price: hasJnJ ? event!.jnj_price : null,
        ...jnjPayload,
        payment_method: paymentMethod,
        amount_owed: total,
        accept_liability: acceptLiability,
        accept_payment: acceptPayment,
        accept_refund: hasRefundStatement ? acceptRefund : true,
      };
      const res = await fetch("/api/comp-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyRegistered && data.eventTitle) {
          setAlreadyRegistered({
            eventTitle: data.eventTitle,
            eventDate: data.eventDate || "",
          });
          return;
        }
        setSubmitError(data.error || "Failed to submit signup");
        return;
      }
      if (data.noRedirect) {
        setSubmitSuccess(data.message || "Signup submitted!");
        setTimeout(() => onClose(), 2500);
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setSubmitSuccess("Signup submitted!");
      setTimeout(() => onClose(), 2000);
    } catch (e: any) {
      setSubmitError(e?.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const visible = embedded ? !!event : (open && !!event);
  if (!visible || !event) return null;

  const dateBlock = (
    <p className="text-gray-300 text-sm">
      <strong>Date:</strong>{" "}
      {formatEventDate(event.starts_at, (event as any).time_zone || DEFAULT_TIME_ZONE)}
      {event.starts_at
        ? ` • ${formatEventTime(event.starts_at, (event as any).time_zone || DEFAULT_TIME_ZONE)} ${getTimeZoneAbbreviation(event.starts_at, (event as any).time_zone || DEFAULT_TIME_ZONE)}`
        : ""}
      <br />
      <strong>Location:</strong> {event.location || "—"}
    </p>
  );

  const howsMyDancingBlock = howsMyDancingUrl ? (
    <div className="pb-4 border-b border-neutral-700">
      <a
        href={howsMyDancingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-signup inline-block w-full text-center py-2"
      >
        How&apos;s My Dancing
      </a>
      <p className="text-gray-400 text-xs mt-2 text-center">Opens the How&apos;s My Dancing site in a new tab.</p>
    </div>
  ) : null;

  const formBlock = (
    <form onSubmit={onSubmit} className="space-y-4">
            <p className="font-medium text-gray-200">Comp registration — at least one division required</p>

            {/* Strictly */}
            {hasStrictly && (
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={strictlySelected}
                    onChange={(e) => setStrictlySelected(e.target.checked)}
                    className="rounded"
                  />
                  <span>Strictly {event.strictly_price != null && `($${Number(event.strictly_price).toFixed(2)})`}</span>
                </label>
                {strictlySelected && (
                  <div className="ml-6 space-y-4">
                    <p className="text-sm text-gray-300">I am the</p>
                    <select
                      value={strictlyRole}
                      onChange={(e) => setStrictlyRole(e.target.value as "lead" | "follow")}
                      className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                    >
                      <option value="">— Select —</option>
                      <option value="lead">Lead</option>
                      <option value="follow">Follow</option>
                    </select>
                    <div className="grid gap-3">
                      <div className="p-3 rounded bg-neutral-800/80 border border-neutral-700">
                        <p className="text-sm font-medium text-primary mb-2">Lead</p>
                        <div className="space-y-2">
                          <input
                            placeholder="Lead first name"
                            value={strictlyLeadFirst}
                            onChange={(e) => setStrictlyLeadFirst(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            placeholder="Lead last name"
                            value={strictlyLeadLast}
                            onChange={(e) => setStrictlyLeadLast(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            type="email"
                            placeholder="Lead email"
                            value={strictlyLeadEmail}
                            onChange={(e) => setStrictlyLeadEmail(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                        </div>
                      </div>
                      <div className="p-3 rounded bg-neutral-800/80 border border-neutral-700">
                        <p className="text-sm font-medium text-primary mb-2">Follow</p>
                        <div className="space-y-2">
                          <input
                            placeholder="Follow first name"
                            value={strictlyFollowFirst}
                            onChange={(e) => setStrictlyFollowFirst(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            placeholder="Follow last name"
                            value={strictlyFollowLast}
                            onChange={(e) => setStrictlyFollowLast(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            type="email"
                            placeholder="Follow email"
                            value={strictlyFollowEmail}
                            onChange={(e) => setStrictlyFollowEmail(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* JnJ - only Lead OR only Follow fields based on dropdown; autopopulate when signed in, always editable */}
            {hasJnJ && (
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={jnjSelected}
                    onChange={(e) => setJnJSelected(e.target.checked)}
                    className="rounded"
                  />
                  <span>JnJ {event.jnj_price != null && `($${Number(event.jnj_price).toFixed(2)})`}</span>
                </label>
                {jnjSelected && (
                  <div className="ml-6 space-y-3">
                    <p className="text-sm text-gray-300">I am a</p>
                    <select
                      value={jnjRole}
                      onChange={(e) => setJnJRole(e.target.value as "lead" | "follow")}
                      className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                    >
                      <option value="">— Select —</option>
                      <option value="lead">Lead</option>
                      <option value="follow">Follow</option>
                    </select>
                    {jnjRole === ROLE_LEAD && (
                      <div className="p-3 rounded bg-neutral-800/80 border border-neutral-700">
                        <p className="text-sm font-medium text-primary mb-2">Lead (you)</p>
                        <div className="space-y-2">
                          <input
                            placeholder="Lead first name"
                            value={jnjLeadFirst}
                            onChange={(e) => setJnJLeadFirst(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            placeholder="Lead last name"
                            value={jnjLeadLast}
                            onChange={(e) => setJnJLeadLast(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            type="email"
                            placeholder="Lead email"
                            value={jnjLeadEmail}
                            onChange={(e) => setJnJLeadEmail(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                        </div>
                      </div>
                    )}
                    {jnjRole === ROLE_FOLLOW && (
                      <div className="p-3 rounded bg-neutral-800/80 border border-neutral-700">
                        <p className="text-sm font-medium text-primary mb-2">Follow (you)</p>
                        <div className="space-y-2">
                          <input
                            placeholder="Follow first name"
                            value={jnjFollowFirst}
                            onChange={(e) => setJnJFollowFirst(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            placeholder="Follow last name"
                            value={jnjFollowLast}
                            onChange={(e) => setJnJFollowLast(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                          <input
                            type="email"
                            placeholder="Follow email"
                            value={jnjFollowEmail}
                            onChange={(e) => setJnJFollowEmail(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment method */}
            <div>
              <p className="font-medium mb-2">Payment method</p>
              <ChoiceCards
                name="paymentMethod"
                aria-label="Payment method"
                value={paymentMethod}
                onChange={(next) => setPaymentMethod(next as PaymentMethod)}
                options={[
                  { value: "Stripe", label: "Stripe (Credit/Debit Card)" },
                  { value: "Cash", label: "Cash" },
                ]}
              />
            </div>

            <div className="p-3 rounded-lg bg-neutral-800 border border-neutral-700">
              <strong>Total:</strong> ${total.toFixed(2)}
            </div>

            <div className="bg-neutral-800 p-3 rounded text-sm">
              <p>
                <strong>Liability Release and Assumption of Risk:</strong> I understand and voluntarily accept the risks associated with participating in dance activities. I release and discharge Clearbrook Hospitality, LLC dba Events at 1900 and Country City Swing, its instructors and affiliates from any claims arising from my participation. I certify that I am physically fit to participate. I authorize Country City Swing to obtain necessary medical treatment if needed. I grant permission for use of photographs/videos for promotional or educational purposes.
              </p>
            </div>
            <label className="block text-sm">
              <input type="checkbox" checked={acceptLiability} onChange={(e) => setAcceptLiability(e.target.checked)} className="mr-2" />
              I accept the liability release.
            </label>
            <label className="block text-sm">
              <input type="checkbox" checked={acceptPayment} onChange={(e) => setAcceptPayment(e.target.checked)} className="mr-2" />
              I understand I will need to complete payment (Stripe or cash at the door) and show confirmation as required.
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
                className="rounded-lg border border-amber-500/60 bg-amber-950/40 p-4 text-amber-100 shadow-lg"
              >
                <p className="font-semibold text-amber-200">
                  You&apos;re already registered for this event
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">{alreadyRegistered.eventTitle}</span>
                  {alreadyRegistered.eventDate && (
                    <>
                      <br />
                      <span className="text-amber-200/90">{alreadyRegistered.eventDate}</span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm text-amber-200/80">
                  No need to sign up again — we&apos;ll see you there!
                </p>
                <button
                  type="button"
                  onClick={() => setAlreadyRegistered(null)}
                  className="mt-3 rounded-md bg-amber-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  OK
                </button>
              </div>
            )}
            {submitError && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 text-red-400 text-sm">
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 text-green-400 text-sm">
                {submitSuccess}
              </div>
            )}

            <div className="flex justify-center">
              <button
                type="submit"
                disabled={isSubmitting || loadingUser}
                className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit Signup"}
              </button>
            </div>
          </form>
  );

  if (embedded) {
    return (
      <div className="text-left space-y-4">
        {dateBlock}
        {howsMyDancingBlock}
        {formBlock}
      </div>
    );
  }

  return (
    <SignupModalShell title={event.title} onClose={onClose}>
      {dateBlock}
      {howsMyDancingBlock}
      {formBlock}
    </SignupModalShell>
  );
}
