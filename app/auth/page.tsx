"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "signup") {
      // ✅ Sign up with metadata
      const { data, error } = await supabaseBrowser.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) {
        alert(error.message);
      } else {
        // ✅ Also update profiles table (optional, but explicit)
        const user = data.user;
        if (user) {
          await supabaseBrowser.from("profiles").update({
            first_name: firstName,
            last_name: lastName,
          }).eq("id", user.id);
        }

        alert("Account created! Check your email for confirmation link.");
      }
    } else {
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });
      if (error) alert(error.message);
      else window.location.href = "/";
    }

    setLoading(false);
  };

  return (
    <div className="max-w-sm mx-auto mt-20 bg-neutral-800 p-6 rounded-lg text-white shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-primary">
        {mode === "signin" ? "Sign In" : "Create Account"}
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

        <input
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button disabled={loading} type="submit" className="btn-signup w-full">
          {loading
            ? "Processing..."
            : mode === "signin"
            ? "Sign In"
            : "Sign Up"}
        </button>
      </form>

      <p className="text-sm mt-3 text-gray-400">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-primary hover:underline"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>

      <Link href="/" className="block mt-4 text-accent hover:text-[#CF9FFF]">
        ← Back to home
      </Link>
    </div>
  );
}
