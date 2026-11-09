"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import {
  communityEventSubmitRequirements,
  validateCommunityEventSubmit,
  type CommunityPaymentMethod,
} from "@/lib/communityEvents";
import {
  DEFAULT_TIME_ZONE,
  fromDateTimeLocalInTimeZone,
  toDateTimeLocalInTimeZone,
} from "@/lib/utils/dateHelpers";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";

const inputCls =
  "w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-white";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft — not visible to the public",
  pending: "Pending CCS review",
  approved: "Approved — live on Non-CCS Events",
  rejected: "Rejected — edit and resubmit",
};

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase text-neutral-500">
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

export default function HostCompEditPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccessOpen, setSubmitSuccessOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [strictlyPrice, setStrictlyPrice] = useState("");
  const [jnjPrice, setJnjPrice] = useState("");
  const [methods, setMethods] = useState<CommunityPaymentMethod[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [disclaimerTone, setDisclaimerTone] = useState("warning");
  const [approvalStatus, setApprovalStatus] = useState("draft");
  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState<
    "strictly" | "jack_and_jill" | "all_american"
  >("jack_and_jill");
  const [competitions, setCompetitions] = useState<{ id: string; name: string }[]>([]);
  const [eventTimeZone, setEventTimeZone] = useState(DEFAULT_TIME_ZONE);

  const startsAtIso = useCallback(
    (local: string) =>
      local ? fromDateTimeLocalInTimeZone(local, eventTimeZone) : null,
    [eventTimeZone]
  );

  const buildSaveBody = useCallback(
    () => ({
      title,
      starts_at: startsAt ? fromDateTimeLocalInTimeZone(startsAt, eventTimeZone) : undefined,
      time_zone: eventTimeZone,
      location,
      description,
      strictly_price: strictlyPrice === "" ? null : Number(strictlyPrice),
      jnj_price: jnjPrice === "" ? null : Number(jnjPrice),
      community_payment_methods: methods,
      community_payment_disclaimer: disclaimer,
      community_payment_disclaimer_tone: disclaimerTone,
    }),
    [
      title,
      startsAt,
      eventTimeZone,
      location,
      description,
      strictlyPrice,
      jnjPrice,
      methods,
      disclaimer,
      disclaimerTone,
    ]
  );

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/non-ccs-events/${eventId}`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    const e = data.event;

    const meRes = await authedFetch("/api/me");
    if (meRes.ok) {
      const me = await meRes.json();
      const role = (me.profile?.role ?? "").toLowerCase();
      const userId = me.profile?.id as string | undefined;
      const organizerId = e.organizer_profile_id as string | undefined;
      if (role === "admin" && organizerId && userId && userId !== organizerId) {
        router.replace(`/admin/non-ccs-events/${eventId}`);
        return;
      }
    }

    const tz = (e.time_zone as string) || DEFAULT_TIME_ZONE;
    setEventTimeZone(tz);
    setTitle(e.title ?? "");
    setStartsAt(e.starts_at ? toDateTimeLocalInTimeZone(String(e.starts_at), tz) : "");
    setLocation(e.location ?? "");
    setDescription(e.description ?? "");
    setStrictlyPrice(e.strictly_price != null ? String(e.strictly_price) : "");
    setJnjPrice(e.jnj_price != null ? String(e.jnj_price) : "");
    setMethods(Array.isArray(e.community_payment_methods) ? e.community_payment_methods : []);
    setDisclaimer(e.community_payment_disclaimer ?? "");
    setDisclaimerTone(e.community_payment_disclaimer_tone ?? "warning");
    setApprovalStatus(e.approval_status ?? "draft");
    setCompetitions(data.competitions ?? e.competitions ?? []);
  }, [eventId, router]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const submitSnapshot = useMemo(
    () => ({
      title,
      starts_at: startsAtIso(startsAt),
      location,
      community_payment_methods: methods,
      competitions,
    }),
    [title, startsAt, location, methods, competitions, startsAtIso]
  );

  const submitRequirements = useMemo(
    () => communityEventSubmitRequirements(submitSnapshot),
    [submitSnapshot]
  );

  const canSubmitForApproval = useMemo(
    () => validateCommunityEventSubmit(submitSnapshot) === null,
    [submitSnapshot]
  );

  const save = async () => {
    setError(null);
    const res = await authedFetch(`/api/non-ccs-events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(buildSaveBody()),
    });
    if (!res.ok) setError(await apiError(res));
    else {
      await load();
      emitCcsSuccessToast("The event has been saved.", 3000);
    }
  };

  const addMethod = () => {
    const id = `m${Date.now()}`;
    setMethods([...methods, { id, label: "Venmo @you" }]);
  };

  const removeMethod = (id: string) => {
    setMethods(methods.filter((m) => m.id !== id));
  };

  const addDivision = async () => {
    if (!compName.trim()) return;
    const res = await authedFetch(`/api/non-ccs-events/${eventId}/competitions`, {
      method: "POST",
      body: JSON.stringify({ name: compName.trim(), comp_type: compType }),
    });
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setCompName("");
    await load();
  };

  const submitForReview = async () => {
    const validationError = validateCommunityEventSubmit(submitSnapshot);
    if (validationError) {
      setError(
        `Cannot submit yet: ${validationError}. Complete every item in the checklist below.`
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const saveRes = await authedFetch(`/api/non-ccs-events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify(buildSaveBody()),
      });
      if (!saveRes.ok) {
        setError(await apiError(saveRes));
        return;
      }
      const res = await authedFetch(`/api/non-ccs-events/${eventId}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setError(await apiError(res));
        return;
      }
      setSubmitSuccessOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const dismissSubmitSuccess = () => {
    setSubmitSuccessOpen(false);
    router.push("/host/comps");
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-neutral-400">Loading…</main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-white">
      <Link href="/host/comps" className="text-sm text-neutral-400 hover:text-white">
        ← My events
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Edit comp event</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Status: {STATUS_LABEL[approvalStatus] ?? approvalStatus}
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        {approvalStatus === "approved" ? (
          <>
            This event is live. Save changes anytime — updates appear on the public event page
            right away.
          </>
        ) : (
          <>
            You can save a draft anytime.{" "}
            <strong className="font-medium text-neutral-400">Submit for approval</strong> is only
            available after every item in the checklist at the bottom is complete.
          </>
        )}
      </p>
      {error && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Event information</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Shown on the public Non-CCS Events list and event page after approval.
          </p>
        </div>

        <Field
          id="event-title"
          label="Event title"
          required
          hint="The name dancers see when browsing Non-CCS Events."
        >
          <input
            id="event-title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field
          id="event-starts"
          label="Start date & time"
          required
          hint={`When the comp begins (${eventTimeZone.replace("_", " ")}).`}
        >
          <input
            id="event-starts"
            type="datetime-local"
            className={inputCls}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>

        <Field
          id="event-location"
          label="Location"
          required
          hint="Venue or city — avoid leaving as TBD if you plan to submit for approval."
        >
          <input
            id="event-location"
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>

        <Field
          id="event-description"
          label="Description"
          hint="Optional details (schedule notes, parking, dress code, etc.)."
        >
          <textarea
            id="event-description"
            className={inputCls}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div>
          <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
            Signup pricing (informational)
          </p>
          <p className="mb-3 text-xs text-neutral-400">
            Optional amounts shown to dancers at registration. Country City Swing does not collect
            payment — you confirm payment on the roster after they pay you directly.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
            <Field
              id="strictly-price"
              label="Strictly fee ($)"
              hint="Leave blank if you are not offering Strictly signup."
            >
              <input
                id="strictly-price"
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={strictlyPrice}
                onChange={(e) => setStrictlyPrice(e.target.value)}
              />
            </Field>
            <Field
              id="jnj-price"
              label="Jack & Jill fee ($)"
              hint="Leave blank if you are not offering JnJ signup."
            >
              <input
                id="jnj-price"
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={jnjPrice}
                onChange={(e) => setJnjPrice(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">How dancers pay you</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Dancers choose one option at signup. You mark them paid on the event roster when you
            receive payment.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase text-neutral-500">
            Payment options<span className="text-primary"> *</span>
          </p>
          <p className="mb-2 text-xs text-neutral-400">
            Add at least one method (e.g. Venmo handle, Zelle, cash at check-in).
          </p>
          {methods.length === 0 && (
            <p className="mb-2 text-sm text-amber-200/90">No payment methods yet.</p>
          )}
          {methods.map((m, i) => (
            <div key={m.id} className="mt-2 flex gap-2">
              <input
                id={i === 0 ? "payment-method-0" : undefined}
                aria-label={`Payment method ${i + 1}`}
                className={inputCls}
                value={m.label}
                onChange={(e) => {
                  const next = [...methods];
                  next[i] = { ...m, label: e.target.value };
                  setMethods(next);
                }}
              />
              <button
                type="button"
                onClick={() => removeMethod(m.id)}
                className="shrink-0 rounded border border-neutral-600 px-3 text-sm text-neutral-400 hover:border-red-500/50 hover:text-red-300"
                aria-label={`Remove payment method ${i + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addMethod} className="mt-3 text-sm text-primary hover:underline">
            + Add payment method
          </button>
        </div>

        <Field
          id="payment-disclaimer"
          label="Payment disclaimer"
          hint="Shown on the signup form (e.g. pay before the event, no refunds from CCS)."
        >
          <textarea
            id="payment-disclaimer"
            className={inputCls}
            rows={2}
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
          />
        </Field>

        <Field
          id="disclaimer-tone"
          label="Disclaimer emphasis"
          hint="Controls highlight color on the signup form."
        >
          <select
            id="disclaimer-tone"
            className={inputCls}
            value={disclaimerTone}
            onChange={(e) => setDisclaimerTone(e.target.value)}
          >
            <option value="neutral">Neutral</option>
            <option value="warning">Warning (yellow)</option>
            <option value="danger">Important (red)</option>
          </select>
        </Field>
      </section>

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Comp divisions</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Each division becomes a competition in the comp console (pairings, judging, results).
            Add at least one before submitting.
          </p>
        </div>

        {competitions.length === 0 ? (
          <p className="text-sm text-amber-200/90">No divisions yet.</p>
        ) : (
          <ul className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200">
            {competitions.map((c) => (
              <li key={c.id} className="list-inside list-disc">
                {c.name}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field
              id="division-name"
              label="New division name"
              hint='e.g. "Open JnJ" or "Novice Strictly".'
            >
              <input
                id="division-name"
                className={inputCls}
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
              />
            </Field>
          </div>
          <Field id="division-type" label="Division type">
            <select
              id="division-type"
              className={inputCls}
              value={compType}
              onChange={(e) =>
                setCompType(
                  e.target.value as "strictly" | "jack_and_jill" | "all_american"
                )
              }
            >
              <option value="jack_and_jill">Jack & Jill</option>
              <option value="all_american">All American</option>
              <option value="strictly">Strictly</option>
            </select>
          </Field>
          <button
            type="button"
            onClick={addDivision}
            className="btn-signup shrink-0 px-4 py-2 text-sm sm:mb-0"
          >
            Add division
          </button>
        </div>
      </section>

      {approvalStatus !== "approved" && approvalStatus !== "pending" && (
        <section
          className="mt-10 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4"
          aria-labelledby="submit-checklist-heading"
        >
          <h2 id="submit-checklist-heading" className="text-base font-semibold text-white">
            Ready to submit?
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            All of the following must be complete before CCS can review your event. Save draft
            anytime while you work.
          </p>
          <ul className="mt-4 space-y-2">
            {submitRequirements.map((req) => (
              <li key={req.id} className="flex items-start gap-2 text-sm">
                <span
                  className={
                    req.met ? "text-green-400" : "text-neutral-500"
                  }
                  aria-hidden
                >
                  {req.met ? "✓" : "○"}
                </span>
                <span className={req.met ? "text-neutral-200" : "text-neutral-400"}>
                  {req.label}
                  {!req.met && (
                    <span className="text-neutral-500"> — not complete</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!canSubmitForApproval && (
            <p className="mt-3 text-sm text-amber-200/90" role="status">
              Submit for approval stays disabled until every item above is checked.
            </p>
          )}
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3 border-t border-neutral-800 pt-8">
        <button
          type="button"
          onClick={save}
          disabled={submitting}
          className="btn-signup px-4 py-2 text-sm disabled:opacity-50"
        >
          {approvalStatus === "approved" ? "Save changes" : "Save draft"}
        </button>
        {approvalStatus !== "approved" && approvalStatus !== "pending" && (
          <button
            type="button"
            onClick={submitForReview}
            disabled={!canSubmitForApproval || submitting}
            title={
              canSubmitForApproval
                ? "Send to Country City Swing for approval"
                : "Complete the checklist above first"
            }
            className="rounded-md border border-primary px-4 py-2 text-sm text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-neutral-600 disabled:text-neutral-500 disabled:hover:bg-transparent"
          >
            {submitting ? "Submitting…" : "Submit for approval"}
          </button>
        )}
        {approvalStatus === "pending" && (
          <p className="w-full text-sm text-neutral-400">
            Your event is in the CCS approval queue. You can still save changes unless an admin
            has locked review.
          </p>
        )}
      </div>

      {submitSuccessOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-success-title"
        >
          <div className="w-full max-w-md rounded-xl border border-primary/40 bg-neutral-900 p-6 shadow-xl">
            <h2 id="submit-success-title" className="text-lg font-semibold text-primary">
              Submitted for review
            </h2>
            <p className="mt-3 text-sm text-neutral-200 leading-relaxed">
              <strong>{title.trim() || "Your event"}</strong> has been sent to Country City
              Swing for approval. It is not public yet. You will be able to run the full comp
              console after an admin approves it.
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              We&apos;ll take you back to My Non-CCS comp events.
            </p>
            <button
              type="button"
              onClick={dismissSubmitSuccess}
              className="btn-signup mt-6 w-full py-2 text-sm"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
