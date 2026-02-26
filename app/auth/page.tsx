"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showForgotConfirmation, setShowForgotConfirmation] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError("");

    if (mode === "forgot") {
      const redirectTo = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/reset-password`;
      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }
      setShowForgotConfirmation(true);
      setLoading(false);
      return;
    }

    if (mode === "signup") {
      // Validate password confirmation
      if (password !== confirmPassword) {
        setPasswordError("Passwords do not match");
        setLoading(false);
        return;
      }

      // Check Supabase configuration
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        console.error("NEXT_PUBLIC_SUPABASE_URL is not configured!");
        alert("Configuration error: Supabase URL not found. Please check your environment variables.");
        setLoading(false);
        return;
      }

      // Always use production URL for email redirect (must match Supabase allowlist)
      // This ensures the redirect URL is in the allowlist regardless of where signup happens
      const redirectUrl = "https://countrycityswing.dance/auth/callback";

      console.log("Attempting signup with:", { 
        email, 
        redirectUrl,
        supabaseUrl: supabaseUrl.substring(0, 30) + "...", // Log partial URL for security
      });

      // ✅ Sign up with metadata and redirect URL
      const { data, error } = await supabaseBrowser.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      // Log the full response for debugging
      console.log("Signup response:", { data, error, hasUser: !!data?.user, hasSession: !!data?.session });

      if (error) {
        console.error("Signup error details:", {
          message: error.message,
          status: error.status,
          name: error.name,
          fullError: error,
        });
        alert(`Error creating account: ${error.message}\n\nPlease check:\n1. Redirect URL is in Supabase allowlist\n2. Email confirmation is enabled\n3. Check browser console for details`);
        setLoading(false);
        return;
      }

      // Check if user was actually created
      if (!data || !data.user) {
        console.error("No user returned from signup. Full response:", data);
        alert("Account creation failed - no user was created. Please check:\n1. Supabase redirect URL allowlist\n2. Email confirmation settings\n3. Browser console for errors");
        setLoading(false);
        return;
      }

      console.log("User created successfully:", {
        id: data.user.id,
        email: data.user.email,
        emailConfirmed: data.user.email_confirmed_at,
        createdAt: data.user.created_at,
      });

      // ✅ Also update profiles table (optional, but explicit)
      try {
        const { error: profileError } = await supabaseBrowser.from("profiles").update({
          first_name: firstName,
          last_name: lastName,
        }).eq("id", data.user.id);

        if (profileError) {
          console.error("Profile update error:", profileError);
          // Don't fail the signup if profile update fails
        }
      } catch (profileErr) {
        console.error("Profile update exception:", profileErr);
      }

      // Show confirmation message
      setShowConfirmation(true);
      
      // Redirect to homepage after 10 seconds
      setTimeout(() => {
        router.push("/");
      }, 10000);
    } else {
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });
      if (error) alert(error.message);
      else router.push("/");
    }

    setLoading(false);
  };

  // Show confirmation message after successful forgot-password request
  if (showForgotConfirmation) {
    return (
      <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-4 text-primary">
          Check Your Email
        </h2>
        <p className="text-gray-300 mb-4">
          We've sent a password reset link to <strong>{email}</strong>
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Click the link in the email to set a new password.
        </p>
        <Link href="/auth" className="block mt-4 text-accent hover:text-[#CF9FFF]">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  // Show confirmation message after successful signup
  if (showConfirmation) {
    return (
      <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-4 text-primary">
          Check Your Email!
        </h2>
        <p className="text-gray-300 mb-4">
          We've sent a confirmation link to <strong>{email}</strong>
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Please check your inbox and click the confirmation link to activate your account.
        </p>
        <p className="text-sm text-gray-500">
          Redirecting to homepage in a few seconds...
        </p>
        <Link href="/" className="block mt-4 text-accent hover:text-[#CF9FFF]">
          ← Go to homepage now
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-primary">
        {mode === "signin" ? "Sign In" : mode === "forgot" ? "Reset password" : "Create Account"}
      </h2>
      <form onSubmit={handleAuth} className="space-y-3">
        {mode === "signup" && (
          <>
            <div className="flex gap-2">
              <input
                className="w-1/2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <input
                className="w-1/2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </>
        )}

        <input
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {mode !== "forgot" && (
          <>
            <input
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError("");
              }}
              required
            />

            {mode === "signup" && (
              <div>
                <input
                  className={`w-full px-3 py-2 rounded bg-neutral-900 border ${
                    passwordError ? "border-red-500" : "border-neutral-700"
                  }`}
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError("");
                  }}
                  required
                />
                {passwordError && (
                  <p className="text-red-500 text-sm mt-1">{passwordError}</p>
                )}
              </div>
            )}
          </>
        )}

        <button disabled={loading} type="submit" className="btn-signup w-full">
          {loading
            ? "Processing..."
            : mode === "forgot"
            ? "Send reset link"
            : mode === "signin"
            ? "Sign In"
            : "Sign Up"}
        </button>
      </form>

      {mode === "forgot" ? (
        <p className="text-sm mt-3 text-gray-400">
          <button
            onClick={() => setMode("signin")}
            className="text-primary hover:underline"
          >
            ← Back to sign in
          </button>
        </p>
      ) : (
        <p className="text-sm mt-3 text-gray-400">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                onClick={() => {
                  setMode("signup");
                  setPasswordError("");
                  setConfirmPassword("");
                }}
                className="text-primary hover:underline"
              >
                Create one
              </button>
              {" · "}
              <button
                onClick={() => setMode("forgot")}
                className="text-primary hover:underline"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("signin");
                  setPasswordError("");
                  setConfirmPassword("");
                }}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      )}

      <Link href="/" className="block mt-4 text-accent hover:text-[#CF9FFF]">
        ← Back to home
      </Link>
    </div>
  );
}
