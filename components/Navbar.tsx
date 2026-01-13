"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

interface UserMeta {
  email?: string;
  user_metadata?: { first_name?: string };
}

export default function Navbar() {
  const [user, setUser] = useState<UserMeta | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Load current user and listen for changes
  useEffect(() => {
  supabaseBrowser.auth.getUser().then(({ data }) => setUser(data.user));

  const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
    (_, session) => setUser(session?.user ?? null)
  );

  return () => listener.subscription.unsubscribe();
}, []);

  const handleSignOut = async () => {
    await supabaseBrowser.auth.signOut();
    setUser(null);
    setMenuOpen(false);
  };

  const displayName =
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
        {/* Logo / Brand */}
        <Link
          href="/"
          className="text-2xl font-bold text-primary whitespace-nowrap"
        >
          Country City Swing
        </Link>

        {/* Hamburger button (mobile only) */}
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

        {/* Desktop Menu */}
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
            <button
              className="text-primary font-medium text-yellow-400 hover:text-red-400 text-sm transition-colors"
              onClick={handleSignOut}
            >
              Hello {displayName}!
            </button>
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

      {/* Mobile Dropdown */}
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
            <button
              onClick={handleSignOut}
              className="block text-yellow-400 hover:text-red-400 text-sm transition-colors"
            >
              Hello {profile?.first_name || profile?.email?.split("@")[0]}! (Sign Out)
            </button>
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
