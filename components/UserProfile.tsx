"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";

export default function UserProfile() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabaseBrowser.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) => setUser(data.user));

    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
        }
    );

    return () => listener.subscription.unsubscribe();
    }, []);

  if (!user)
    return <p className="text-gray-400">You’re not signed in.</p>;

  return (
    <div className="text-white text-sm space-y-2">
      <p>Signed in as <strong>{user.email}</strong></p>
      <button
        onClick={() => supabaseBrowser.auth.signOut()}
        className="btn-signup"
      >
        Sign Out
      </button>
    </div>
  );
}
