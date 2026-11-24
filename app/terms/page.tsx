import type { Metadata } from "next";
import LegalDocumentLayout, { LegalSection } from "@/components/legal/LegalDocumentLayout";
import {
  LEGAL_BRAND_URL,
  LEGAL_CITY_REGION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EXAMPLE_VENUE,
  LEGAL_GOVERNING_STATE,
  LEGAL_SITE_NAME,
} from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Terms of Service — Country City Swing",
  description: "Terms governing use of Country City Swing's website and related services.",
};

const SECTIONS = [
  { id: "agreement", title: "Agreement" },
  { id: "eligibility", title: "Eligibility" },
  { id: "account", title: "Accounts" },
  { id: "events", title: "Events and classes" },
  { id: "comps", title: "Competitions" },
  { id: "merch", title: "Merchandise" },
  { id: "lessons", title: "Private lessons" },
  { id: "payments", title: "Payments and refunds" },
  { id: "conduct", title: "Conduct" },
  { id: "content", title: "User content and media" },
  { id: "ip", title: "Intellectual property" },
  { id: "third-party", title: "Third-party services" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnification" },
  { id: "disputes", title: "Disputes and governing law" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentLayout title="Terms of Service" sections={SECTIONS}>
      <LegalSection id="agreement" title="Agreement to these Terms">
        <p>
          These Terms of Service (“<strong>Terms</strong>”) govern your access to and use of the website
          at <a href={LEGAL_BRAND_URL}>{LEGAL_BRAND_URL}</a> and related online tools operated by{" "}
          <strong>{LEGAL_SITE_NAME}</strong> (“<strong>CCS</strong>,” “<strong>we</strong>,” “
          <strong>us</strong>,” or “<strong>our</strong>”), together with in-person classes, events,
          competitions, and activities we organize (collectively, the “<strong>Services</strong>”).
        </p>
        <p>
          By using the Services, you agree to these Terms and to our{" "}
          <a href="/privacy" className="text-primary underline">
            Privacy Policy
          </a>
          . If you do not agree, do not use the Services. Additional rules may appear at registration
          (for example liability releases, refund statements, or competition rules); those apply to the
          specific activity you select.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" title="Eligibility">
        <p>
          You must be able to form a binding contract in your jurisdiction to use the Services. If you
          are under 18, you represent that a parent or legal guardian agrees to these Terms and any
          event-specific releases on your behalf. You are responsible for determining whether
          participation in dance activities is appropriate for your health and skill level.
        </p>
      </LegalSection>

      <LegalSection id="account" title="Accounts and security">
        <p>
          Some features require an account. You agree to provide accurate information, keep credentials
          confidential, and notify us of unauthorized use. We may suspend or terminate accounts that
          violate these Terms or pose risk to the community.
        </p>
        <p>
          Authentication and password reset emails are part of account security. See our Privacy Policy
          for how we handle account data.
        </p>
      </LegalSection>

      <LegalSection id="events" title="Events, classes, and registrations">
        <p>
          Event details (time, location, price, capacity, and requirements) are shown on the site at
          registration. Locations may include third-party venues—for example {LEGAL_EXAMPLE_VENUE} when
          listed for a particular event.
        </p>
        <p>
          Registration may require you to acknowledge assumption of risk, a liability release, payment
          terms, refund policies displayed for that event, and (separately) optional marketing email
          preferences where offered. <strong>Do not register</strong> unless you agree to the
          acknowledgments presented at checkout.
        </p>
        <p>
          We may refuse or cancel registration for capacity, safety, conduct, or administrative reasons;
          applicable refund treatment depends on the event’s stated refund policy.
        </p>
      </LegalSection>

      <LegalSection id="comps" title="Competitions">
        <p>
          Competition signups may involve partner information, division rules, fees, and releases that
          reference specific venues or operators (for example hospitality venues hosting competitions).
          You are responsible for the accuracy of partner data and for ensuring partners understand
          their obligations. Scoring, judging, and awards are subject to published competition rules.
        </p>
      </LegalSection>

      <LegalSection id="merch" title="Merchandise">
        <p>
          Merchandise may be offered for pickup or shipping. Preorder items may ship on a delayed
          timeline described at checkout. You must acknowledge preorder terms when required. Title and
          risk of loss pass according to the delivery method you select once we hand off goods to a
          carrier or make them available for pickup.
        </p>
      </LegalSection>

      <LegalSection id="lessons" title="Private lessons">
        <p>
          Private lessons are scheduled between students and instructors through our tools. Instructors
          may publish disclaimers you must accept before booking. Lessons are instructional services, not
          guarantees of particular outcomes. Cancellations and rescheduling follow instructor and CCS
          policies communicated at booking.
        </p>
      </LegalSection>

      <LegalSection id="payments" title="Payments and refunds">
        <p>
          Online card payments are processed by Stripe. You authorize us and our processors to charge
          your selected payment method for amounts shown at checkout, including applicable taxes and
          fees where displayed.
        </p>
        <p>
          Cash, team, or offline payment methods may be offered for certain events; those options have
          their own acknowledgment language at signup. Refunds, when available, are handled according to
          the refund statement for the relevant event or order and our administrative tools—not every
          purchase is refundable. Promotional codes may change amounts due but do not override written
          refund rules unless explicitly stated.
        </p>
      </LegalSection>

      <LegalSection id="conduct" title="Community conduct">
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Harass, threaten, or discriminate against others.</li>
          <li>Misuse prayer or message features to send spam or abusive content.</li>
          <li>Attempt to bypass security, scrape data, or disrupt DJ/social systems.</li>
          <li>Impersonate others or provide false registration information.</li>
          <li>Violate applicable law or venue rules while participating in CCS activities.</li>
        </ul>
        <p>
          We may remove content, revoke access to features, or exclude participants from events for
          conduct that harms the community or safety.
        </p>
      </LegalSection>

      <LegalSection id="content" title="User content and publicity">
        <p>
          You may submit content (profile text, prayer requests, song requests, etc.). You retain
          ownership but grant CCS a non-exclusive license to use content as needed to operate the
          Services (display profiles, deliver requests, operate events).
        </p>
        <p>
          Where you agree to photo/video release language at an event, you grant the rights described in
          that release (often promotional or educational use). If you prefer not to appear in promotional
          media, contact us before the event; practical opt-out may depend on venue and production
          circumstances.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="Intellectual property">
        <p>
          The CCS name, logos, site design, and original content are owned by CCS or licensors. You may
          not copy, modify, or distribute them without permission except for personal, non-commercial
          use allowed by law. Music played at events or through integrations remains subject to
          copyright and platform licenses (Spotify, Apple Music, etc.).
        </p>
      </LegalSection>

      <LegalSection id="third-party" title="Third-party services and links">
        <p>
          The Services integrate with third parties (hosting, email, payments, music APIs, map data,
          bot protection). Your use of those features is also subject to those parties’ terms. We are not
          responsible for third-party websites linked from our site or bio links.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" title="Disclaimers">
        <p>
          DANCE AND PHYSICAL ACTIVITY INVOLVE INHERENT RISK. THE SERVICES AND ALL CONTENT ARE PROVIDED “
          <strong>AS IS</strong>” AND “<strong>AS AVAILABLE</strong>” WITHOUT WARRANTIES OF ANY KIND,
          WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p>
          We do not warrant uninterrupted or error-free operation, accurate BPM or music metadata, or
          that instructors’ independent lesson offerings meet any particular standard beyond what they
          publish.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, CCS AND ITS INSTRUCTORS, VOLUNTEERS, AFFILIATES, AND
          SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICES OR
          PARTICIPATION IN ACTIVITIES, EVEN IF ADVISED OF THE POSSIBILITY.
        </p>
        <p>
          OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF OR RELATING TO THE SERVICES OR THESE TERMS IS
          LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID TO CCS FOR THE SPECIFIC TRANSACTION GIVING
          RISE TO THE CLAIM IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS
          (US $100), UNLESS A DIFFERENT LIMIT IS REQUIRED BY APPLICABLE LAW AND CANNOT BE WAIVED.
        </p>
        <p>
          <em>
            Note for counsel: Limitation and release interplay with on-site liability waivers and
            Tennessee premises/activity law should be reviewed for consistency.
          </em>
        </p>
      </LegalSection>

      <LegalSection id="indemnity" title="Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless CCS and its personnel from claims arising
          from your misuse of the Services, your violation of these Terms, your violation of others’
          rights, or your participation in activities contrary to posted rules or releases—except to the
          extent caused by our gross negligence or willful misconduct as determined by law.
        </p>
      </LegalSection>

      <LegalSection id="disputes" title="Governing law and disputes">
        <p>
          These Terms are governed by the laws of the State of {LEGAL_GOVERNING_STATE}, without regard
          to conflict-of-law rules, except where federal law applies. Venue for disputes arising from
          these Terms or the Services shall be in courts located in {LEGAL_CITY_REGION}, unless
          mandatory consumer protection rules in your jurisdiction require otherwise.
        </p>
        <p>
          Before filing a claim, you agree to contact us at{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> to attempt informal
          resolution.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these Terms">
        <p>
          We may modify these Terms. Continued use after the effective date of updated Terms constitutes
          acceptance where permitted by law. Material changes may be highlighted on the site.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          {LEGAL_SITE_NAME}
          <br />
          {LEGAL_CITY_REGION}
          <br />
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
