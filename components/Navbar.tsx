"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

interface UserMeta {
  id?: string;
  email?: string;
  user_metadata?: { first_name?: string };
}

const DNA_GREEN = "#2BC929";

export default function Navbar() {
  const pathname = usePathname();
  const isDnaPage = pathname === "/dna";
  const isEventPageTest = pathname === "/test/event-page";
  const useAccentNav = isDnaPage || isEventPageTest;
  const [user, setUser] = useState<UserMeta | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ first_name?: string; last_name?: string; role?: string } | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showFinances, setShowFinances] = useState(false);

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
        setShowFinances(false);
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
          setShowFinances(false);
          return;
        }
        const data = await res.json();
        const p = data.profile ?? null;
        setProfile(p);
        if (!p) {
          setShowRegistration(false);
          setShowSchedule(false);
          setShowFinances(false);
          return;
        }
        const roleLower = (p.role || "").toLowerCase();
        const isAdminRole = roleLower === "admin";
        const financeAccess = data.finance_access as string | null | undefined;
        setShowFinances(financeAccess === "admin" || financeAccess === "social_viewer");
        // Non-CCS-Instructor does not get Schedule tab (profile-only role)
        const isInstructor =
          !isAdminRole &&
          roleLower !== "non-ccs-instructor" &&
          (roleLower === "instructor" || roleLower.includes("instructor"));
        setShowSchedule(isAdminRole || isInstructor);
        setShowRegistration(!!data.show_registration);
      } catch {
        setProfile(null);
        setShowRegistration(false);
        setShowSchedule(false);
        setShowFinances(false);
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
    { name: "Events", href: "/#events" },
    { name: "CCS Team", href: "/team" },
    { name: "Prayer", href: "/prayer" },
    { name: "Media", href: "/media" },
    { name: "Merch", href: "/merch" },
    { name: "Instructors", href: "/instructors" },
    { name: "About", href: "/about" },
  ];

  const hasExpandedNav = showRegistration || showSchedule || showFinances;
  const desktopNavVisibleClass = hasExpandedNav ? "xl:flex" : "lg:flex";
  const hamburgerVisibleClass = hasExpandedNav ? "xl:hidden" : "lg:hidden";

  const navClassName = [
    "sticky top-0 z-50 w-full bg-neutral-900 border-b border-neutral-800 text-white shadow-md",
    isDnaPage ? "nav-dna" : "",
    isEventPageTest ? "nav-ep-accent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const linkClass = useAccentNav
    ? isEventPageTest
      ? "nav-ep-accent-link transition-colors"
      : "text-[#2BC929] hover:text-[#32e032] transition-colors"
    : "text-gray-300 hover:text-primary transition-colors";
  const logoClass = useAccentNav
    ? isEventPageTest
      ? "text-sm leading-tight sm:text-lg md:text-2xl font-bold min-w-0 shrink-0 nav-ep-accent-logo"
      : "text-sm leading-tight sm:text-lg md:text-2xl font-bold min-w-0 shrink-0 transition-colors"
    : "text-sm leading-tight sm:text-lg md:text-2xl font-bold text-primary min-w-0 shrink-0";
  const logoWidthClass = hasExpandedNav
    ? "max-w-[calc(100%-2.75rem)] xl:max-w-none"
    : "max-w-[calc(100%-2.75rem)] lg:max-w-none";
  const signInClass = isDnaPage
    ? "btn-signup nav-dna-signup text-sm px-4 py-2 rounded-md"
    : isEventPageTest
      ? "btn-signup nav-ep-accent-signup text-sm px-4 py-2 rounded-md"
      : "btn-signup text-sm px-4 py-2 rounded-md";

  const dnaNavStyle = isDnaPage
    ? {
        boxShadow: "0 2px 8px rgba(43, 201, 41, 0.35)",
        borderBottomColor: "rgba(43, 201, 41, 0.3)",
      }
    : undefined;

  return (
    <nav className={navClassName} style={dnaNavStyle}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
        {/* Logo */}
        <Link
          href="/"
          className={`${logoClass} ${logoWidthClass}`}
          style={isDnaPage ? { color: DNA_GREEN } : undefined}
        >
          Country City Swing
        </Link>

        {/* Hamburger (compact / mobile) */}
        <button
          className={
            (isEventPageTest
              ? "nav-ep-accent-link transition-colors"
              : isDnaPage
                ? "text-gray-300 hover:text-[#2BC929] transition-colors"
                : "text-gray-300 hover:text-primary transition-colors") +
            ` ml-auto shrink-0 ${hamburgerVisibleClass}`
          }
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
        <div
          className={`hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm xl:text-base ${desktopNavVisibleClass}`}
        >
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
          {showFinances && (
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
        <div className={`bg-neutral-900 border-t border-neutral-800 px-6 py-4 space-y-4 ${hamburgerVisibleClass}`}>
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
          {showFinances && (
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
