"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

function isLinksRoute(pathname: string) {
  return pathname === "/links";
}

function isFullBleedRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/events" ||
    pathname === "/about" ||
    pathname === "/prayer" ||
    pathname === "/test/event-page"
  );
}

function isWideRoute(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/registration") ||
    pathname.startsWith("/spotify/deck")
  );
}

function isDeckRoute(pathname: string) {
  return pathname.startsWith("/spotify/deck");
}

function isJudgeRoute(pathname: string) {
  return pathname === "/judge" || pathname.startsWith("/judge/");
}

function mainMaxWidthClass(pathname: string) {
  if (isWideRoute(pathname)) return "max-w-7xl";
  if (isJudgeRoute(pathname)) return "max-w-2xl";
  return "max-w-5xl";
}

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (isLinksRoute(pathname)) {
    return <>{children}</>;
  }

  if (isFullBleedRoute(pathname)) {
    return (
      <>
        <Navbar />
        <main className="flex-grow w-full min-w-0">{children}</main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main
        className={`flex-grow ${mainMaxWidthClass(pathname)} mx-auto w-full min-w-0 px-4 sm:px-6 ${
          isDeckRoute(pathname) ? "py-4 sm:py-10" : "py-10"
        }`}
        data-density={pathname.startsWith("/admin") || isJudgeRoute(pathname) ? "compact" : undefined}
      >
        {children}
      </main>
      <Footer />
    </>
  );
}
