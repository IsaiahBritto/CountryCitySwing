"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

function isLinksRoute(pathname: string) {
  return pathname === "/links";
}

function isEventPageTestRoute(pathname: string) {
  return pathname === "/test/event-page";
}

function isWideRoute(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/registration");
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

  if (isEventPageTestRoute(pathname)) {
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
        className={`flex-grow ${mainMaxWidthClass(pathname)} mx-auto w-full min-w-0 px-4 sm:px-6 py-10`}
      >
        {children}
      </main>
      <Footer />
    </>
  );
}
