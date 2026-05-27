import { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance"
).replace(/\/$/, "");

const title = "Country City Swing — Links";
const description =
  "Book events, view schedule, shop merch, prayer requests, and more from Country City Swing in Nashville.";

export const viewport: Viewport = {
  themeColor: "#111218",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  robots: { index: false, follow: true },
  openGraph: {
    title,
    description,
    url: `${siteUrl}/links`,
    siteName: "Country City Swing",
    images: [
      {
        url: "/media/logo-dark.PNG",
        width: 150,
        height: 150,
        alt: "Country City Swing logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/media/logo-dark.PNG"],
  },
};

export default function LinksLayout({ children }: { children: ReactNode }) {
  return children;
}
