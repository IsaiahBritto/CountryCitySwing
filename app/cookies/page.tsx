import type { Metadata } from "next";
import LegalDocumentLayout, { LegalSection } from "@/components/legal/LegalDocumentLayout";
import { LEGAL_BRAND_URL, LEGAL_CONTACT_EMAIL, LEGAL_SITE_NAME } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Cookie Policy — Country City Swing",
  description: "Cookies and similar technologies used on countrycityswing.dance.",
};

const SECTIONS = [
  { id: "intro", title: "Introduction" },
  { id: "what", title: "What we use" },
  { id: "table", title: "Cookie and storage list" },
  { id: "choices", title: "Your choices" },
  { id: "third", title: "Third-party technologies" },
  { id: "updates", title: "Updates" },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocumentLayout title="Cookie Policy" sections={SECTIONS}>
      <LegalSection id="intro" title="Introduction">
        <p>
          This Cookie Policy explains how <strong>{LEGAL_SITE_NAME}</strong> (“<strong>CCS</strong>”) uses
          cookies, local storage, and similar technologies on{" "}
          <a href={LEGAL_BRAND_URL}>{LEGAL_BRAND_URL}</a>. It should be read with our{" "}
          <a href="/privacy" className="text-primary underline">
            Privacy Policy
          </a>
          .
        </p>
        <p>
          We do <strong>not</strong> currently use third-party advertising cookies or mainstream
          analytics trackers (such as Google Analytics) in our application code. If that changes, we will
          update this policy and, where required, ask for consent before non-essential tracking.
        </p>
      </LegalSection>

      <LegalSection id="what" title="What cookies and storage are">
        <p>
          <strong>Cookies</strong> are small text files stored by your browser.{" "}
          <strong>Local storage</strong> and <strong>session storage</strong> are browser features that
          persist data on your device for site functionality (for example a shopping cart).
        </p>
      </LegalSection>

      <LegalSection id="table" title="Technologies we use">
        <div className="overflow-x-auto rounded-lg border border-neutral-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-800 text-gray-200">
              <tr>
                <th className="px-3 py-2 font-semibold">Name / key</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Purpose</th>
                <th className="px-3 py-2 font-semibold">Typical duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-700">
              <tr>
                <td className="px-3 py-2 font-mono text-xs">Supabase auth session</td>
                <td className="px-3 py-2">Cookie / storage (provider-managed)</td>
                <td className="px-3 py-2">Keeps you signed in to your account</td>
                <td className="px-3 py-2">Session / refresh per Supabase settings</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-xs">ccs_social_requester</td>
                <td className="px-3 py-2">HttpOnly cookie</td>
                <td className="px-3 py-2">
                  Anonymous song-request identity for “The Social” when you are not logged in
                </td>
                <td className="px-3 py-2">Up to ~30 days</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-xs">spotify_oauth_state</td>
                <td className="px-3 py-2">HttpOnly cookie</td>
                <td className="px-3 py-2">Security state for Spotify OAuth (DJ/admin flows)</td>
                <td className="px-3 py-2">Short-lived during login</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-xs">ccs-cart</td>
                <td className="px-3 py-2">localStorage</td>
                <td className="px-3 py-2">Merchandise cart contents</td>
                <td className="px-3 py-2">Until cleared by user or code</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-xs">ccs_cookie_notice_ack</td>
                <td className="px-3 py-2">localStorage</td>
                <td className="px-3 py-2">Remembers that you dismissed the cookie notice</td>
                <td className="px-3 py-2">Persistent until cleared</td>
              </tr>
              <tr>
                <td className="px-3 py-2">DJ deck / judge autosave keys</td>
                <td className="px-3 py-2">localStorage / sessionStorage</td>
                <td className="px-3 py-2">Operational tools for staff roles</td>
                <td className="px-3 py-2">Varies</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Cloudflare Turnstile</td>
                <td className="px-3 py-2">Third-party widget</td>
                <td className="px-3 py-2">Bot protection on prayer and some social requests</td>
                <td className="px-3 py-2">Per Cloudflare</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Exact cookie names for authentication may change with provider updates. Essential cookies are
          necessary for security and features you request.
        </p>
      </LegalSection>

      <LegalSection id="choices" title="Your choices">
        <p>
          You can block or delete cookies in your browser settings. Doing so may prevent sign-in, cart
          persistence, social song requests, or admin music integrations from working correctly.
        </p>
        <p>
          When we show a cookie notice on first visit, it explains functional use and links to this
          policy. It does not track you across other websites.
        </p>
      </LegalSection>

      <LegalSection id="third" title="Third-party technologies">
        <p>
          Cloudflare Turnstile, Stripe Checkout, Spotify, Apple Music, and embedded media may set or read
          technologies when you interact with them. Their use is governed by those companies’ policies.
        </p>
      </LegalSection>

      <LegalSection id="updates" title="Updates">
        <p>
          We may update this policy when we add features. Questions:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
