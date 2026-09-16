"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { CcsFormField, CcsInput, CcsTextarea } from "@/components/ccs/CcsFormField";

const schema = z.object({
  name: z.string().optional(),
  message: z.string().min(3, "Please enter a prayer request."),
});

type FormData = z.infer<typeof schema>;

export default function PrayerForm() {
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setIsLoggedIn(true);
        setAccessToken(session.access_token);
      } else {
        setIsLoggedIn(false);
      }
    });
  }, []);

  const onSubmit = async (data: FormData) => {
    setSubmitError(null);

    if (!isLoggedIn && !turnstileToken) {
      setSubmitError("Please complete the captcha verification.");
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (isLoggedIn && accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const body: Record<string, string | undefined> = {
      name: data.name,
      message: data.message,
    };
    if (!isLoggedIn) {
      body.turnstileToken = turnstileToken ?? undefined;
    }

    const res = await fetch("/api/prayer", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setSubmitError(payload.error ?? "Failed to send prayer request.");
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      return;
    }

    reset();
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  return (
    <div className="relative max-w-lg mx-auto my-6 animate-purplePulse">
      <form onSubmit={handleSubmit(onSubmit)} className="ccs-form-panel p-6 text-left">
        {isSubmitSuccessful && (
          <p className="text-green-400 mb-4">
            🙏 Your prayer request has been sent!
          </p>
        )}

        {submitError && (
          <p className="text-red-400 mb-4">{submitError}</p>
        )}

        <CcsFormField label="Your Name" htmlFor="prayer-name" optional>
          <CcsInput
            id="prayer-name"
            {...register("name")}
            placeholder="e.g., Joe Smith"
          />
        </CcsFormField>

        <CcsFormField
          label="Prayer Request"
          htmlFor="prayer-message"
          error={errors.message ? String(errors.message.message) : undefined}
        >
          <CcsTextarea
            id="prayer-message"
            {...register("message")}
            placeholder="Share your request..."
          />
        </CcsFormField>

        {isLoggedIn === false && siteKey && (
          <div className="mb-4 flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
          </div>
        )}

        <div className="flex justify-center">
          <button
            disabled={
              isSubmitting ||
              isLoggedIn === null ||
              (isLoggedIn === false && !turnstileToken)
            }
            type="submit"
            className="ccs-btn ccs-btn--ghost-gold border-accent text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed normal-case tracking-normal"
          >
            {isSubmitting ? "Sending..." : "Send Prayer Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
