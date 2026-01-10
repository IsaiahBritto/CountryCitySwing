"use client";

import Link from "next/link";
import { useState } from "react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
  { name: "Team", href: "/team" },
  { name: "Events", href: "/events" },
  { name: "Media", href: "/media" },
  { name: "Prayer", href: "/prayer" },
  // Settings link optional—remove if you’re deleting that page
  { name: "Settings", href: "/settings" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-[#111218] border-b border-neutral-800 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-primary tracking-tight">
          Country City Swing
        </Link>

        {/* Desktop menu */}
        <div className="hidden md:flex space-x-6 items-center">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="hover:text-primary text-gray-200 transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-gray-200 hover:text-primary"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? (
            <XMarkIcon className="w-6 h-6" />
          ) : (
            <Bars3Icon className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden bg-neutral-800 border-t border-neutral-700 flex flex-col px-4 py-3 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="py-2 text-gray-200 hover:text-primary"
              onClick={() => setOpen(false)}
            >
              {link.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
