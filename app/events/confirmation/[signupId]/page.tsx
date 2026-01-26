"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function EventConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const signupId = params.signupId as string;
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState<any>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let pollAttempts = 0;
    const maxPollAttempts = 30; // Poll for up to 30 seconds (30 attempts * 1 second)
    let isMounted = true;

    async function loadSignup() {
      if (!isMounted) return;
      
      try {
        const { data, error: fetchError } = await supabaseBrowser
          .from("signups")
          .select("*")
          .eq("id", signupId)
          .single();

        if (fetchError || !data) {
          // If signup doesn't exist yet, keep polling (webhook might still be processing)
          pollAttempts++;
          if (pollAttempts >= maxPollAttempts) {
            if (isMounted) {
              setError("Signup not found. Payment may still be processing.");
              setLoading(false);
            }
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
          return; // Continue polling
        }

        // Signup found - stop polling
        if (isMounted) {
          setSignup(data);
          setLoading(false);
        }
        if (pollInterval) {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error loading signup:", err);
        pollAttempts++;
        if (pollAttempts >= maxPollAttempts && isMounted) {
          setError("Failed to load signup information");
          setLoading(false);
        }
      }
    }

    if (signupId) {
      // Load immediately
      loadSignup();
      
      // Poll every second until signup is found or max attempts reached
      pollInterval = setInterval(() => {
        if (pollAttempts < maxPollAttempts && isMounted) {
          loadSignup();
        } else if (pollInterval) {
          clearInterval(pollInterval);
        }
      }, 1000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [signupId]);

  // Auto-redirect countdown
  useEffect(() => {
    if (!signup || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.push("/events");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [signup, countdown, router]);

  const handleContinue = () => {
    router.push("/events");
  };

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
            onClick={handleContinue}
            className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all"
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
        {/* Success Icon */}
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">
            Registration Confirmed!
          </h1>
          <p className="text-gray-300">
            You're all set for this event
          </p>
        </div>

        {/* Event Details */}
        <div className="bg-neutral-700 rounded-lg p-6 mb-6 text-left">
          <h2 className="text-xl font-semibold text-primary mb-4">
            Event Details
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-gray-400 text-sm mb-1">Event</p>
              <p className="text-white text-lg font-medium">
                {signup.event_title}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Name</p>
              <p className="text-white">
                {signup.first_name} {signup.last_name}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Email</p>
              <p className="text-white">{signup.email}</p>
            </div>
            {signup.paid && (
              <div>
                <p className="text-gray-400 text-sm mb-1">Payment Status</p>
                <p className="text-green-400 font-semibold">
                  ✓ Paid via {signup.payment_method}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Message */}
        <div className="mb-6">
          <p className="text-gray-300 mb-2">
            Thank you for registering! We're excited to see you at the event.
          </p>
          {signup.paid ? (
            <p className="text-green-400 font-semibold">
              Your payment has been confirmed.
            </p>
          ) : (
            <p className="text-yellow-400 text-sm">
              Please complete your payment to secure your spot.
            </p>
          )}
        </div>

        {/* Auto-redirect notice */}
        <div className="mb-6">
          <p className="text-gray-400 text-sm">
            Redirecting to events page in {countdown} second{countdown !== 1 ? "s" : ""}...
          </p>
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)]"
        >
          Continue to Events
        </button>
      </div>
    </div>
  );
}
