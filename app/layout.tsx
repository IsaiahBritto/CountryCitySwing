import "./globals.css";
import type { Viewport } from "next";
import { ReactNode } from "react";
import CartProviderWrapper from "../components/CartProviderWrapper";
import CcsToastHost from "../components/CcsToastHost";
import SiteShell from "../components/SiteShell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata = {
  title: "Country City Swing",
  description: "Nashville’s Country Swing partner dancing studio",
  icons: {
    icon: [
      {
        url: "/media/logo-light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/media/logo-dark.PNG",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-900 text-neutral-100 font-sans min-h-screen antialiased flex flex-col">
        <CartProviderWrapper>
          <CcsToastHost />
          <SiteShell>{children}</SiteShell>
        </CartProviderWrapper>
      </body>
    </html>
  );
}
