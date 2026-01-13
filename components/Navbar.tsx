"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

interface UserMeta {
  id?: string;
  email?: string;
  user_metadata?: { first_name?: string };
}

export default function Navbar() {
  const [user, setUser] = useState<UserMeta | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Load and listen for auth changes
  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
      (_: AuthChangeEvent, session: Session | null) =>
        setUser(session?.user ?? null)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // Fetch profile when user changes
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return setProfile(null);
      const { data } = await supabaseBrowser
        .from("profiles")
        .select("first_name, last_name, role")
        .eq("id", user.id)
        .single();
      if (data) setProfile(data);
    };
    fetchProfile();
  }, [user]);

  const displayName =
    profile?.first_name ||
    user?.user_metadata?.first_name ||
    (user?.email ? user.email.split("@")[0] : "");

  const navLinks = [
    { name: "Events", href: "/events" },
    { name: "Team", href: "/team" },
    { name: "Prayer", href: "/prayer" },
    { name: "Media", href: "/media" },
    { name: "About", href: "/about" },
  ];

  return (
    <nav className="w-full bg-neutral-900 border-b border-neutral-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <Link
          href="/"
          className="text-2xl font-bold text-primary whitespace-nowrap"
        >
          Country City Swing
        </Link>

        {/* Hamburger (mobile) */}
        <button
          className="md:hidden text-gray-300 hover:text-primary transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <XMarkIcon className="w-7 h-7 text-primary" />
          ) : (
            <Bars3Icon className="w-7 h-7" />
          )}
        </button>

        {/* Desktop menu */}
        <div className="hidden md:flex items-center space-x-6">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-gray-300 hover:text-primary transition-colors"
            >
              {link.name}
            </Link>
          ))}

          {user ? (
            <Link
              href="/profile"
              className="text-gray-300 hover:text-primary transition-colors"
            >
              Hello {displayName}!
            </Link>
          ) : (
            <Link
              href="/auth"
              className="btn-signup text-sm px-4 py-2 rounded-md"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-neutral-900 border-t border-neutral-800 px-6 py-4 space-y-4">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block text-gray-300 hover:text-primary transition-colors"
            >
              {link.name}
            </Link>
          ))}

          {user ? (
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="block text-gray-300 hover:text-primary transition-colors"
            >
              Hello {displayName}!
            </Link>
          ) : (
            <Link
              href="/auth"
              onClick={() => setMenuOpen(false)}
              className="btn-signup block text-center text-sm px-4 py-2 rounded-md"
            >
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
