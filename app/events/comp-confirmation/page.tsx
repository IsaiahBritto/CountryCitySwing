"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function CompConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState<any>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let pollAttempts = 0;
    const pollIntervalMs = 3000;
    const maxPollAttempts = 20; // Poll for up to 60 seconds (20 attempts * 3 seconds)
    let isMounted = true;

    async function loadSignup() {
      if (!isMounted || !sessionId) return;
      try {
        const res = await fetch(`/api/comp-signup/confirmation?session_id=${sessionId}`);
        const result = await res.json();
        if (!res.ok || !result.signup) {
          pollAttempts++;
          if (pollAttempts >= maxPollAttempts && isMounted) {
            setError("Comp signup not found yet. Your payment was successful — check your email or contact us at contact.us@countrycityswing.dance");
            setLoading(false);
          }
          return;
        }
        if (isMounted) {
          setSignup(result.signup);
          setLoading(false);
        }
        if (pollInterval) clearInterval(pollInterval!);
      } catch (err) {
        pollAttempts++;
        if (pollAttempts >= maxPollAttempts && isMounted) {
          setError("Failed to load confirmation");
          setLoading(false);
        }
      }
    }

    if (sessionId) {
      loadSignup();
      pollInterval = setInterval(() => {
        if (pollAttempts < maxPollAttempts && isMounted) loadSignup();
        else if (pollInterval) clearInterval(pollInterval);
      }, pollIntervalMs);
    } else {
      setError("Invalid confirmation link");
      setLoading(false);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!signup || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? (router.push("/events"), 0) : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [signup, countdown, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !signup) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <p className="text-red-400 mb-4">{error || "Signup not found"}</p>
          <button
            onClick={() => router.push("/events")}
            className="bg-accent text-white px-6 py-2 rounded-md font-semibold"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-neutral-800 rounded-lg shadow-[0_0_25px_rgba(187,134,252,0.6)] p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">Comp Registration Confirmed!</h1>
          <p className="text-gray-300">You&apos;re all set for How&apos;s My Dancing.</p>
        </div>

        <div className="bg-neutral-700 rounded-lg p-6 mb-6 text-left">
          <h2 className="text-xl font-semibold text-primary mb-4">Details</h2>
          <div className="space-y-3">
            <p className="text-white font-medium">{signup.event_title}</p>
            {signup.paid && (
              <p className="text-green-400 font-semibold">✓ Paid via {signup.payment_method}</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-gray-400 text-sm">
            Redirecting to events in {countdown} second{countdown !== 1 ? "s" : ""}...
          </p>
        </div>

        <button
          onClick={() => router.push("/events")}
          className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all"
        >
          Continue to Events
        </button>
      </div>
    </div>
  );
}

export default function CompConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      }
    >
      <CompConfirmationContent />
    </Suspense>
  );
}
