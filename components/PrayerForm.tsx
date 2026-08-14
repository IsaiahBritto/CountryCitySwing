"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
    <div className="relative max-w-lg mx-auto my-10 p-[0px] rounded-lg bg-gradient-to-br from-purple-500/60 to-purple-300/40 shadow-[0_0_25px_rgba(187,134,252,0.6)] animate-purplePulse">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-neutral-800 p-6 rounded-lg shadow-lg text-left"
      >
        {isSubmitSuccessful && (
          <p className="text-green-400 mb-4">
            🙏 Your prayer request has been sent!
          </p>
        )}

        {submitError && (
          <p className="text-red-400 mb-4">{submitError}</p>
        )}

        <div className="mb-4">
          <label className="block mb-1 text-gray-300">
            Your Name (optional)
          </label>
          <input
            {...register("name")}
            className="w-full px- py-2 rounded bg-neutral-900 border border-neutral-700 text-white"
            placeholder=" e.g., Joe Smith"
          />
        </div>

        <div className="mb-6">
          <label className="block mb-1 text-gray-300">Prayer Request</label>
          <textarea
            {...register("message")}
            className="w-full h-32 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-white"
            placeholder="Share your request..."
          />
          {errors.message && (
            <p className="text-red-400 text-sm mt-1">
              {String(errors.message.message)}
            </p>
          )}
        </div>

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
            className="bg-accent text-white px-6 py-2 rounded font-medium transition-all duration-300 shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)] hover:bg-[#CF9FFF] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Sending..." : "Send Prayer Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
