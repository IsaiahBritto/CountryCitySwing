"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing confirmation...");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the hash from the URL (handles both # and %23 encoded)
        let hash = window.location.hash;
        if (!hash && window.location.href.includes("%23")) {
          // If hash is URL-encoded, decode it
          hash = decodeURIComponent(window.location.href.split("%23")[1] || "");
          if (hash && !hash.startsWith("#")) {
            hash = "#" + hash;
          }
        }

        if (!hash || hash.length < 2) {
          // Check if already authenticated
          const { data: { session } } = await supabaseBrowser.auth.getSession();
          if (session) {
            setStatus("success");
            setMessage("You're already signed in! Redirecting...");
            setTimeout(() => router.push("/"), 2000);
            return;
          }
          
          setStatus("error");
          setMessage("No confirmation tokens found. Redirecting to sign in...");
          setTimeout(() => router.push("/auth"), 3000);
          return;
        }

        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const error = hashParams.get("error");
        const errorDescription = hashParams.get("error_description");

        if (error) {
          setStatus("error");
          setMessage(errorDescription || error || "An error occurred during confirmation");
          setTimeout(() => router.push("/auth"), 3000);
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

          // Success - redirect to auth page
          setStatus("success");
          setMessage("Account confirmed! Redirecting to sign in...");
          setTimeout(() => router.push("/auth"), 2000);
        } else {
          // No tokens found - might already be confirmed or invalid link
          setStatus("error");
          setMessage("Invalid confirmation link. Redirecting to sign in...");
          setTimeout(() => router.push("/auth"), 3000);
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setMessage(err.message || "An error occurred. Redirecting to sign in...");
        setTimeout(() => router.push("/auth"), 3000);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg text-center">
      {status === "loading" && (
        <>
          <div className="mb-4">
            <div className="mx-auto h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-primary">Confirming Account...</h2>
          <p className="text-gray-300">{message}</p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-green-500"
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
          <h2 className="text-2xl font-bold mb-4 text-primary">Account Confirmed!</h2>
          <p className="text-gray-300">{message}</p>
        </>
      )}

      {status === "error" && (
        <>
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-red-500"
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
          <h2 className="text-2xl font-bold mb-4 text-red-500">Error</h2>
          <p className="text-gray-300">{message}</p>
        </>
      )}
    </div>
  );
}
