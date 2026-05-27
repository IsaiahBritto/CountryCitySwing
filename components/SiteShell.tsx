"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

function isLinksRoute(pathname: string) {
  return pathname === "/links";
}

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (isLinksRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-grow max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">
        {children}
      </main>
      <Footer />
    </>
  );
}
