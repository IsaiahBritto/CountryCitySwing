"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

const PRODUCTION_URL = "https://countrycityswing.dance";

export default function AuthCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing confirmation...");
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [isEmailChangeSuccess, setIsEmailChangeSuccess] = useState(false);

  useEffect(() => {
    // Check if we're on localhost
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    setIsLocalhost(isLocal);

    const handleAuthCallback = async () => {
      try {
        // Get hash for parsing (email-change or magic-link tokens may be in hash)
        let hash = window.location.hash;
        if (!hash && window.location.href.includes("%23")) {
          hash = decodeURIComponent(window.location.href.split("%23")[1] || "");
          if (hash && !hash.startsWith("#")) hash = "#" + hash;
        }
        const hashParams = hash && hash.length > 1 ? new URLSearchParams(hash.substring(1)) : null;

        // Email change: token_hash and type=email_change can be in query OR in hash (depending on Supabase redirect)
        const searchParams = new URLSearchParams(window.location.search);
        const emailChangeTokenHash =
          searchParams.get("token_hash") ?? hashParams?.get("token_hash");
        const emailChangeType =
          searchParams.get("type") ?? hashParams?.get("type");

        if (emailChangeTokenHash && emailChangeType === "email_change") {
          const { data, error: verifyError } = await supabaseBrowser.auth.verifyOtp({
            token_hash: emailChangeTokenHash,
            type: "email_change",
          });
          if (verifyError) {
            setStatus("error");
            setMessage(verifyError.message || "Email change link invalid or expired.");
            return;
          }
          // Ensure client has the latest session (new email) before user navigates to profile
          if (data?.session) {
            await supabaseBrowser.auth.setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            });
          } else {
            await supabaseBrowser.auth.refreshSession();
          }
          window.history.replaceState(null, "", window.location.pathname);
          setIsEmailChangeSuccess(true);
          setStatus("success");
          setMessage("Your email address has been updated successfully.");
          return;
        }

        if (!hash || hash.length < 2) {
          // Check if already authenticated
          const { data: { session } } = await supabaseBrowser.auth.getSession();
          if (session) {
            setStatus("success");
            setMessage("Your account is already confirmed and you're signed in!");
            return;
          }

          setStatus("error");
          setMessage("No confirmation tokens found in the link.");
          return;
        }

        const accessToken = hashParams?.get("access_token");
        const refreshToken = hashParams?.get("refresh_token");
        const error = hashParams?.get("error");
        const errorDescription = hashParams?.get("error_description");

        if (error) {
          setStatus("error");
          setMessage(errorDescription || error || "An error occurred during confirmation");
          return;
        }

        if (accessToken && refreshToken) {
          // Set the session using the tokens
          const { error: sessionError } = await supabaseBrowser.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }

          // Clear the hash from URL
          window.history.replaceState(null, "", window.location.pathname);

          // Success!
          setStatus("success");
          setMessage("Your email has been confirmed successfully!");
        } else {
          // No tokens found - might already be confirmed or invalid link
          setStatus("error");
          setMessage("Invalid confirmation link. Please check your email for the correct link.");
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setMessage(err.message || "An error occurred during confirmation.");
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-neutral-800 p-8 rounded-lg text-white shadow-lg text-center">
        {status === "loading" && (
          <>
            <div className="mb-6">
              <div className="mx-auto h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold mb-4 text-primary">Confirming Account...</h2>
            <p className="text-gray-300">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mb-6">
              <svg
                className="mx-auto h-20 w-20 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold mb-4 text-primary">
              {isEmailChangeSuccess ? "Email updated" : "Email Confirmed!"}
            </h2>
            <p className="text-gray-300 mb-2 text-lg">{message}</p>
            <p className="text-gray-400 mb-6 text-sm">
              {isEmailChangeSuccess
                ? "Your account email is updated. You can continue to your profile."
                : "Your account is now active. You can sign in to Country City Swing."}
            </p>

            {isEmailChangeSuccess && (
              <a
                href={typeof window !== "undefined" ? `${window.location.origin}/profile` : `${PRODUCTION_URL}/profile`}
                className="block w-full btn-signup py-3 text-center font-semibold mb-3"
              >
                Go to profile
              </a>
            )}

            {isLocalhost && (
              <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <p className="text-yellow-300 text-sm mb-2">
                  You're viewing this on localhost. Visit the live site to sign in:
                </p>
                <a
                  href={`${PRODUCTION_URL}/auth`}
                  className="text-primary hover:text-[#CF9FFF] font-semibold underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Go to CountryCitySwing.dance
                </a>
              </div>
            )}

            <div className="space-y-3">
              <a
                href={`${PRODUCTION_URL}/auth`}
                className="block w-full btn-signup py-3 text-center font-semibold"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sign In to Country City Swing
              </a>
              <a
                href={PRODUCTION_URL}
                className="block text-accent hover:text-[#CF9FFF] text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit CountryCitySwing.dance
              </a>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mb-6">
              <svg
                className="mx-auto h-20 w-20 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold mb-4 text-red-500">Confirmation Error</h2>
            <p className="text-gray-300 mb-6">{message}</p>
            
            <div className="space-y-3">
              <a
                href={`${PRODUCTION_URL}/auth`}
                className="block w-full btn-signup py-3 text-center font-semibold"
                target="_blank"
                rel="noopener noreferrer"
              >
                Go to Sign In Page
              </a>
              <a
                href={PRODUCTION_URL}
                className="block text-accent hover:text-[#CF9FFF] text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit CountryCitySwing.dance
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
