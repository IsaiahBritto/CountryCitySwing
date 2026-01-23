import "./globals.css";
import { ReactNode } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import CartProviderWrapper from "../components/CartProviderWrapper";

export const metadata = {
  title: "Country City Swing",
  description: "Nashville’s Country Swing partner dancing studio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-900 text-neutral-100 font-sans min-h-screen antialiased flex flex-col">
        <CartProviderWrapper>
          {/* Navbar */}
          <Navbar />

          {/* Main content grows to fill space */}
          <main className="flex-grow max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">
            {children}
          </main>

          {/* Footer stays pinned at bottom */}
          <Footer />
        </CartProviderWrapper>
      </body>
    </html>
  );
}
