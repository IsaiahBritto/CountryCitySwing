"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collectCompSignupRecipients,
  collectSignupRecipients,
  type BroadcastAudience,
} from "@/lib/registrationBroadcastRecipients";

type SignupLike = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  paid: boolean;
  refunded_or_cancelled?: string | null;
};

type CompSignupLike = {
  id: string;
  paid: boolean;
  refunded_or_cancelled?: string | null;
  strictly_lead_first_name?: string | null;
  strictly_lead_last_name?: string | null;
  strictly_lead_email?: string | null;
  strictly_follow_first_name?: string | null;
  strictly_follow_last_name?: string | null;
  strictly_follow_email?: string | null;
  jnj_lead_first_name?: string | null;
  jnj_lead_last_name?: string | null;
  jnj_lead_email?: string | null;
  jnj_follow_first_name?: string | null;
  jnj_follow_last_name?: string | null;
  jnj_follow_email?: string | null;
};

export default function RegistrationBroadcastPanel({
  eventId,
  eventTitle,
  isCompEvent,
  signups,
  compSignups,
  sessionToken,
}: {
  eventId: string;
  eventTitle: string;
  isCompEvent: boolean;
  signups: SignupLike[];
  compSignups: CompSignupLike[];
  sessionToken: string | null;
}) {
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [subject, setSubject] = useState(() => `Update: ${eventTitle}`);
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    setSubject(`Update: ${eventTitle}`);
    setBodyText("");
    setError(null);
    setResult(null);
  }, [eventId, eventTitle]);

  const recipientCount = useMemo(() => {
    if (isCompEvent) {
      return collectCompSignupRecipients(compSignups, audience).length;
    }
    return collectSignupRecipients(signups, audience).length;
  }, [audience, compSignups, isCompEvent, signups]);

  const sendBroadcast = async () => {
    if (!sessionToken) {
      setError("You must be signed in to send email.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!bodyText.trim()) {
      setError("Message body is required.");
      return;
    }
    if (recipientCount === 0) {
      setError("No recipients match this audience.");
      return;
    }

    const label =
      audience === "unpaid"
        ? `${recipientCount} unpaid registrant(s)`
        : `${recipientCount} registrant(s)`;
    if (
      !window.confirm(
        `Send this email to ${label} for "${eventTitle}"?`
      )
    ) {
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/registration/broadcast", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: eventId,
          audience,
          subject: subject.trim(),
          body_text: bodyText.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to send email"
        );
      }
      const sent = (data as { sent?: number }).sent ?? 0;
      const failed = (data as { failed?: number }).failed ?? 0;
      if (failed > 0) {
        setResult(`Sent ${sent} email(s). ${failed} failed — check server logs.`);
      } else {
        setResult(`Sent ${sent} email(s) successfully.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-8 rounded-lg border border-neutral-600 bg-neutral-900/40 p-4 md:p-6">
      <h2 className="text-lg font-semibold text-white">Email registrants</h2>
      <p className="mt-1 text-sm text-gray-400">
        Send a styled update to people registered for this event. Your message
        appears in the body; the email includes the event name, date, and location.
      </p>

      <div className="mt-4 space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-gray-300 mb-2">
            Recipients
          </legend>
          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="broadcast-audience"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
                disabled={sending}
              />
              Everyone registered
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="broadcast-audience"
                checked={audience === "unpaid"}
                onChange={() => setAudience("unpaid")}
                disabled={sending}
              />
              Unpaid only
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {recipientCount} recipient{recipientCount === 1 ? "" : "s"} (cancelled
            registrations excluded; duplicate emails merged)
          </p>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm text-gray-300">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            disabled={sending}
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-gray-300">Message</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={8}
            maxLength={8000}
            disabled={sending}
            placeholder="Write the email body here. Blank lines become new paragraphs."
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white min-h-[10rem]"
          />
        </label>

        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="text-sm text-green-300" role="status">
            {result}
          </p>
        )}

        <button
          type="button"
          onClick={() => void sendBroadcast()}
          disabled={sending || recipientCount === 0 || !bodyText.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-black hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending…" : "Send email"}
        </button>
      </div>
    </div>
  );
}
