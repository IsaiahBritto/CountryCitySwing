"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getEventDateStringInChicago, getTodayStringInChicago } from "@/lib/utils/dateHelpers";

interface UserMeta {
  id?: string;
  email?: string;
  user_metadata?: { first_name?: string };
}

const DNA_GREEN = "#2BC929";

export default function Navbar() {
  const pathname = usePathname();
  const isDnaPage = pathname === "/dna";
  const [user, setUser] = useState<UserMeta | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ first_name?: string; last_name?: string; role?: string } | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load and listen for auth changes
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
      (_: AuthChangeEvent, s: Session | null) => {
        setSession(s);
        setUser(s?.user ?? null);
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // Single /api/me call for profile + optional events_near_today (replaces client profiles + events queries)
  useEffect(() => {
    const fetchMe = async () => {
      if (!session?.access_token) {
        setProfile(null);
        setShowRegistration(false);
        setShowSchedule(false);
        setIsAdmin(false);
        return;
      }
      try {
        const res = await fetch("/api/me?events_near_today=1", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          setProfile(null);
          setShowRegistration(false);
          setShowSchedule(false);
          setIsAdmin(false);
          return;
        }
        const data = await res.json();
        const p = data.profile ?? null;
        setProfile(p);
        if (!p) {
          setShowRegistration(false);
          setShowSchedule(false);
          setIsAdmin(false);
          return;
        }
        const roleLower = (p.role || "").toLowerCase();
        const isAdminRole = roleLower === "admin";
        const isInstructor =
          !isAdminRole && (roleLower === "instructor" || roleLower.includes("instructor"));
        setIsAdmin(isAdminRole);
        setShowSchedule(isAdminRole || isInstructor);
        if (isAdminRole) {
          setShowRegistration(true);
        } else if (isInstructor && Array.isArray(data.events_near_today)) {
          const todayChicago = getTodayStringInChicago();
          const hasEventToday = data.events_near_today.some(
            (e: { starts_at: string }) => getEventDateStringInChicago(e.starts_at) === todayChicago
          );
          setShowRegistration(!!hasEventToday);
        } else {
          setShowRegistration(false);
        }
      } catch {
        setProfile(null);
        setShowRegistration(false);
        setShowSchedule(false);
        setIsAdmin(false);
      }
    };
    fetchMe();
  }, [session?.access_token]);

  const displayName =
    profile?.first_name ||
    user?.user_metadata?.first_name ||
    (user?.email ? user.email.split("@")[0] : "");

  const navLinks = [
    { name: "DNA", href: "/dna" },
    { name: "Events", href: "/events" },
    { name: "Team", href: "/team" },
    { name: "Prayer", href: "/prayer" },
    { name: "Media", href: "/media" },
    { name: "Merch", href: "/merch" },
    { name: "About", href: "/about" },
  ];

  const navClassName = isDnaPage
    ? "nav-dna w-full bg-neutral-900 border-b border-neutral-800 text-white shadow-md"
    : "w-full bg-neutral-900 border-b border-neutral-800 text-white shadow-md";

  const linkClass = isDnaPage
    ? "text-[#2BC929] hover:text-[#32e032] transition-colors"
    : "text-gray-300 hover:text-primary transition-colors";
  const logoClass = isDnaPage
    ? "text-2xl font-bold whitespace-nowrap transition-colors"
    : "text-2xl font-bold text-primary whitespace-nowrap";
  const signInClass = isDnaPage
    ? "btn-signup nav-dna-signup text-sm px-4 py-2 rounded-md"
    : "btn-signup text-sm px-4 py-2 rounded-md";

  return (
    <nav className={navClassName} style={isDnaPage ? { boxShadow: "0 2px 8px rgba(43, 201, 41, 0.35)", borderBottomColor: "rgba(43, 201, 41, 0.3)" } : undefined}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <Link
          href="/"
          className={logoClass}
          style={isDnaPage ? { color: DNA_GREEN } : undefined}
        >
          Country City Swing
        </Link>

        {/* Hamburger (mobile) */}
        <button
          className={isDnaPage ? "md:hidden text-gray-300 hover:text-[#2BC929] transition-colors" : "md:hidden text-gray-300 hover:text-primary transition-colors"}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <XMarkIcon className="w-7 h-7" style={isDnaPage ? { color: DNA_GREEN } : undefined} />
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
              className={linkClass}
            >
              {link.name}
            </Link>
          ))}
          {showRegistration && (
            <Link href="/registration" className={linkClass}>
              Registration
            </Link>
          )}
          {showSchedule && (
            <Link href="/schedule" className={linkClass}>
              Schedule
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/finances" className={linkClass}>
              Finances
            </Link>
          )}

          {user ? (
            <Link href="/profile" className={linkClass}>
              Hello {displayName}!
            </Link>
          ) : (
            <Link href="/auth" className={signInClass} style={isDnaPage ? { color: DNA_GREEN } : undefined}>
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
              className={"block " + linkClass}
            >
              {link.name}
            </Link>
          ))}
          {showRegistration && (
            <Link href="/registration" onClick={() => setMenuOpen(false)} className={"block " + linkClass}>
              Registration
            </Link>
          )}
          {showSchedule && (
            <Link href="/schedule" onClick={() => setMenuOpen(false)} className={"block " + linkClass}>
              Schedule
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/finances" onClick={() => setMenuOpen(false)} className={"block " + linkClass}>
              Finances
            </Link>
          )}

          {user ? (
            <Link href="/profile" onClick={() => setMenuOpen(false)} className={"block " + linkClass}>
              Hello {displayName}!
            </Link>
          ) : (
            <Link href="/auth" onClick={() => setMenuOpen(false)} className={signInClass + " block text-center"} style={isDnaPage ? { color: DNA_GREEN } : undefined}>
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
