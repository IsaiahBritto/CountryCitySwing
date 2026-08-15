"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch } from "@/lib/comps/clientAuth";
import { profileDisplayName, profileHasCompleteName } from "@/lib/profileUtils";
import { DEFAULT_TIME_ZONE, formatEventDate, formatEventTime, getTimeZoneAbbreviation } from "@/lib/utils/dateHelpers";
import SignupModalShell from "@/components/SignupModalShell";
import ChoiceCards from "@/components/ChoiceCards";
import ProfileSearchPicker, { type ProfileResult } from "@/components/ProfileSearchPicker";
import CompLevelBadge from "@/components/CompLevelBadge";

type CompEvent = {
  id: string | number;
  title: string;
  starts_at: string;
  location?: string | null;
  signupLink?: string | null;
  signup_link?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  refund_statement?: string | null;
  refundStatement?: string | null;
};

type PaymentMethod = "Stripe" | "Cash";
type AuthState = "loading" | "logged_out" | "no_profile" | "ready";

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
  embedded?: boolean;
}) {
  const pathname = usePathname();
  const authNext = pathname ? `/auth?next=${encodeURIComponent(pathname)}` : "/auth";

  const hasStrictly = event && event.strictly_price != null && Number(event.strictly_price) >= 0;
  const hasJnJ = event && event.jnj_price != null && Number(event.jnj_price) >= 0;
  const howsMyDancingUrl = event?.signupLink || event?.signup_link || "";
  const refundStatement =
    (typeof event?.refund_statement === "string" && event.refund_statement.trim()) ||
    (typeof event?.refundStatement === "string" && event.refundStatement.trim()) ||
    "";
  const hasRefundStatement = Boolean(refundStatement);

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [selfProfile, setSelfProfile] = useState<ProfileResult | null>(null);

  const [strictlySelected, setStrictlySelected] = useState(false);
  const [jnjSelected, setJnJSelected] = useState(false);
  const [strictlyRole, setStrictlyRole] = useState<"lead" | "follow" | "">("");
  const [jnjRole, setJnJRole] = useState<"lead" | "follow" | "">("");
  const [strictlyPartner, setStrictlyPartner] = useState<ProfileResult | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Stripe");

  const [acceptLiability, setAcceptLiability] = useState(false);
  const [acceptPayment, setAcceptPayment] = useState(false);
  const [acceptRefund, setAcceptRefund] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
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
      setAuthState("loading");
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setSelfProfile(null);
          setAuthState("logged_out");
          return;
        }
        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("id, first_name, last_name, email")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!profile) {
          setSelfProfile(null);
          setAuthState("no_profile");
          return;
        }
        setSelfProfile(profile as ProfileResult);
        setProfileFirstName(profile.first_name?.trim() ?? "");
        setProfileLastName(profile.last_name?.trim() ?? "");
        setAuthState("ready");
      } catch {
        if (!cancelled) {
          setSelfProfile(null);
          setAuthState("logged_out");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, embedded, event?.id]);

  useEffect(() => {
    if (!open && !embedded) {
      setStrictlySelected(false);
      setJnJSelected(false);
      setStrictlyRole("");
      setJnJRole("");
      setStrictlyPartner(null);
      setPaymentMethod("Stripe");
      setAcceptLiability(false);
      setAcceptPayment(false);
      setAcceptRefund(false);
      setSubmitError("");
      setSubmitSuccess("");
      setProfileFirstName("");
      setProfileLastName("");
      setAlreadyRegistered(null);
    }
  }, [open, embedded]);

  useEffect(() => {
    setStrictlyPartner(null);
  }, [strictlyRole]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const profileNeedsName =
    selfProfile != null && !profileHasCompleteName(selfProfile);

  const validate = (): string | null => {
    if (authState !== "ready" || !selfProfile) {
      return "Sign in with a CCS account to register.";
    }
    if (profileNeedsName) {
      if (!profileFirstName.trim()) return "First name is required on your account.";
      if (!profileLastName.trim()) return "Last name is required on your account.";
    }
    if (!strictlySelected && !jnjSelected) return "Please select at least one: Strictly or JnJ.";
    if (strictlySelected && hasStrictly) {
      if (!strictlyRole) return "Strictly: select whether you are Lead or Follow.";
      if (!strictlyPartner) return "Strictly: search for and select your partner.";
    }
    if (jnjSelected && hasJnJ) {
      if (!jnjRole) return "JnJ: select whether you are Lead or Follow.";
    }
    if (!acceptLiability) return "The above is a required field.";
    if (!acceptPayment) return "The above is a required field.";
    if (hasRefundStatement && !acceptRefund) return "The above is a required field.";
    return null;
  };

  const buildProfilePayload = () => {
    const registrantId = selfProfile!.id;
    let strictlyLeadId: string | null = null;
    let strictlyFollowId: string | null = null;
    let jnjLeadId: string | null = null;
    let jnjFollowId: string | null = null;

    if (strictlySelected && strictlyRole && strictlyPartner) {
      if (strictlyRole === ROLE_LEAD) {
        strictlyLeadId = registrantId;
        strictlyFollowId = strictlyPartner.id;
      } else {
        strictlyFollowId = registrantId;
        strictlyLeadId = strictlyPartner.id;
      }
    }

    if (jnjSelected && jnjRole) {
      if (jnjRole === ROLE_LEAD) jnjLeadId = registrantId;
      else jnjFollowId = registrantId;
    }

    return {
      registrant_profile_id: registrantId,
      strictly_role: strictlySelected ? strictlyRole || null : null,
      strictly_lead_profile_id: strictlyLeadId,
      strictly_follow_profile_id: strictlyFollowId,
      jnj_role: jnjSelected ? jnjRole || null : null,
      jnj_lead_profile_id: jnjLeadId,
      jnj_follow_profile_id: jnjFollowId,
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
      if (profileNeedsName) {
        const profileRes = await authedFetch("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({
            first_name: profileFirstName.trim(),
            last_name: profileLastName.trim(),
          }),
        });
        if (!profileRes.ok) {
          const profileData = await profileRes.json().catch(() => ({}));
          setSubmitError(
            profileData.error || "Failed to save your name to your profile."
          );
          return;
        }
        setSelfProfile({
          ...selfProfile!,
          first_name: profileFirstName.trim(),
          last_name: profileLastName.trim(),
        });
      }

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
        jnj_selected: jnjSelected,
        jnj_price: hasJnJ ? event!.jnj_price : null,
        ...buildProfilePayload(),
        profile_first_name: profileNeedsName ? profileFirstName.trim() : undefined,
        profile_last_name: profileNeedsName ? profileLastName.trim() : undefined,
        payment_method: paymentMethod,
        amount_owed: total,
        accept_liability: acceptLiability,
        accept_payment: acceptPayment,
        accept_refund: hasRefundStatement ? acceptRefund : true,
      };
      const res = await authedFetch("/api/comp-signup", {
        method: "POST",
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
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const visible = embedded ? !!event : (open && !!event);
  if (!visible || !event) return null;

  const dateBlock = (
    <p className="text-gray-300 text-sm">
      <strong>Date:</strong>{" "}
      {formatEventDate(event.starts_at, (event as { time_zone?: string }).time_zone || DEFAULT_TIME_ZONE)}
      {event.starts_at
        ? ` • ${formatEventTime(event.starts_at, (event as { time_zone?: string }).time_zone || DEFAULT_TIME_ZONE)} ${getTimeZoneAbbreviation(event.starts_at, (event as { time_zone?: string }).time_zone || DEFAULT_TIME_ZONE)}`
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

  const authGateBlock = (
    <div className="rounded-lg border border-neutral-600 bg-neutral-800/80 p-6 text-center space-y-4">
      {authState === "loading" && (
        <p className="text-gray-300 text-sm">Checking your account…</p>
      )}
      {authState === "logged_out" && (
        <>
          <p className="text-gray-200 font-medium">Sign in to register for this comp</p>
          <p className="text-gray-400 text-sm">
            Comp registration requires a Country City Swing account so we can link your profile to your entry.
          </p>
          <Link
            href={authNext}
            className="inline-block bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all"
          >
            Sign in or create account
          </Link>
        </>
      )}
      {authState === "no_profile" && (
        <>
          <p className="text-gray-200 font-medium">Complete your CCS profile</p>
          <p className="text-gray-400 text-sm">
            Your account needs a profile before you can register. Create or finish setting up your account.
          </p>
          <Link
            href={authNext}
            className="inline-block bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all"
          >
            Go to account setup
          </Link>
        </>
      )}
    </div>
  );

  const selfCard = selfProfile && authState === "ready" && (
    <div className="p-3 rounded-lg bg-neutral-800 border border-primary/40">
      <p className="text-xs uppercase tracking-wide text-primary mb-1">Competing as</p>
      <p className="text-white font-medium">
        {profileNeedsName
          ? profileDisplayName({
              first_name: profileFirstName,
              last_name: profileLastName,
              email: selfProfile.email,
            })
          : profileDisplayName(selfProfile)}
      </p>
      {selfProfile.email && (
        <p className="text-gray-400 text-sm mt-0.5">{selfProfile.email}</p>
      )}
    </div>
  );

  const formBlock = authState === "ready" ? (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="font-medium text-gray-200">Comp registration — at least one division required</p>
      {selfCard}

      {profileNeedsName && (
        <div className="space-y-3 rounded-lg border border-amber-600/50 bg-amber-950/40 p-3">
          <p className="text-sm text-amber-100">
            Your account is missing a name — enter it below. We&apos;ll save it to your
            profile when you submit.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={profileFirstName}
              onChange={(e) => setProfileFirstName(e.target.value)}
              placeholder="First name"
              className="w-1/2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
              required
            />
            <input
              type="text"
              value={profileLastName}
              onChange={(e) => setProfileLastName(e.target.value)}
              placeholder="Last name"
              className="w-1/2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
              required
            />
          </div>
        </div>
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
            <span>Strictly {event.strictly_price != null && `($${Number(event.strictly_price).toFixed(2)})`}</span>
            {event.strictly_level && (
              <CompLevelBadge level={event.strictly_level} className="ml-2" />
            )}
          </label>
          {strictlySelected && (
            <div className="ml-6 space-y-4">
              <div>
                <p className="text-sm text-gray-300 mb-2">I am the</p>
                <select
                  value={strictlyRole}
                  onChange={(e) => setStrictlyRole(e.target.value as "lead" | "follow")}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white"
                >
                  <option value="">— Select —</option>
                  <option value="lead">Lead</option>
                  <option value="follow">Follow</option>
                </select>
              </div>
              {strictlyRole && (
                <ProfileSearchPicker
                  label={strictlyRole === ROLE_LEAD ? "Your partner (Follow)" : "Your partner (Lead)"}
                  value={strictlyPartner}
                  onChange={setStrictlyPartner}
                  excludeProfileId={selfProfile?.id}
                />
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
            <span>JnJ {event.jnj_price != null && `($${Number(event.jnj_price).toFixed(2)})`}</span>
            {event.jnj_level && (
              <CompLevelBadge level={event.jnj_level} className="ml-2" />
            )}
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
            </div>
          )}
        </div>
      )}

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
          <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">Refund policy</p>
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
        <div role="alert" className="rounded-lg border border-amber-500/60 bg-amber-950/40 p-4 text-amber-100 shadow-lg">
          <p className="font-semibold text-amber-200">You&apos;re already registered for this event</p>
          <p className="mt-2 text-sm">
            <span className="font-medium">{alreadyRegistered.eventTitle}</span>
            {alreadyRegistered.eventDate && (
              <>
                <br />
                <span className="text-amber-200/90">{alreadyRegistered.eventDate}</span>
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-amber-200/80">No need to sign up again — we&apos;ll see you there!</p>
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
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 text-red-400 text-sm">{submitError}</div>
      )}
      {submitSuccess && (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 text-green-400 text-sm">{submitSuccess}</div>
      )}

      <div className="flex justify-center">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit Signup"}
        </button>
      </div>
    </form>
  ) : (
    authGateBlock
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
