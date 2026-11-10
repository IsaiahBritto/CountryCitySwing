import type { Metadata } from "next";
import LegalDocumentLayout, { LegalSection } from "@/components/legal/LegalDocumentLayout";
import {
  LEGAL_BRAND_URL,
  LEGAL_CITY_REGION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EXAMPLE_VENUE,
  LEGAL_MAILING_ADDRESS,
  LEGAL_PRIVACY_EMAIL,
  LEGAL_SITE_NAME,
} from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Privacy Policy — Country City Swing",
  description:
    "How Country City Swing collects, uses, and protects personal information on countrycityswing.dance.",
};

const SECTIONS = [
  { id: "overview", title: "Overview" },
  { id: "controller", title: "Who we are" },
  { id: "collect", title: "Information we collect" },
  { id: "sources", title: "How we collect it" },
  { id: "use", title: "How we use information" },
  { id: "legal-bases", title: "Legal bases (EEA/UK)" },
  { id: "share", title: "Sharing and processors" },
  { id: "email", title: "Email and text" },
  { id: "cookies", title: "Cookies and storage" },
  { id: "public", title: "Public profiles and media" },
  { id: "retention", title: "Retention" },
  { id: "security", title: "Security" },
  { id: "children", title: "Children" },
  { id: "rights", title: "Your rights and choices" },
  { id: "us-states", title: "U.S. state notices" },
  { id: "international", title: "International transfers" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout title="Privacy Policy" sections={SECTIONS}>
      <LegalSection id="overview" title="Overview">
        <p>
          This Privacy Policy explains how <strong>{LEGAL_SITE_NAME}</strong> (“<strong>CCS</strong>,” “
          <strong>we</strong>,” “<strong>us</strong>,” or “<strong>our</strong>”) handles personal
          information when you visit <a href={LEGAL_BRAND_URL}>{LEGAL_BRAND_URL}</a>, create an
          account, register for events or competitions, purchase merchandise, book private lessons,
          submit prayer requests, use interactive features (such as song requests at socials), or
          otherwise interact with our services (collectively, the “<strong>Services</strong>”).
        </p>
        <p>
          We aim to be transparent and accurate: this policy describes our{" "}
          <strong>actual practices</strong> on the website as it is built today. It is not a substitute
          for individualized legal advice. If anything in this policy conflicts with a signed release,
          order form, or written agreement with you, that agreement controls for that transaction.
        </p>
      </LegalSection>

      <LegalSection id="controller" title="Who we are">
        <p>
          {LEGAL_SITE_NAME} is a country swing dance community and instruction organization based in{" "}
          {LEGAL_CITY_REGION}. We operate classes, workshops, social dances, competitions, team
          activities, merchandise sales, and related online tools.
        </p>
        <p>
          <strong>Principal contact for privacy:</strong>{" "}
          <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>
        </p>
        <p>
          <strong>Physical event locations</strong> vary by event. When an event listing names a venue,
          that listing applies only to that event. For example, some classes may be held at third-party
          studios such as {LEGAL_EXAMPLE_VENUE}. Renting space at a studio for scheduled activities does
          not necessarily make that studio our principal place of business or our legal mailing address.
        </p>
        {LEGAL_MAILING_ADDRESS ? (
          <p>
            <strong>Postal mailing address:</strong> {LEGAL_MAILING_ADDRESS}
          </p>
        ) : (
          <p>
            <strong>Postal mailing address:</strong> To be designated. Until counsel provides a
            CAN-SPAM-compliant and policy-appropriate mailing address, please use email at{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> for privacy and legal
            correspondence.
          </p>
        )}
      </LegalSection>

      <LegalSection id="collect" title="Information we collect">
        <p>Depending on how you use the Services, we may collect the following categories of information:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account and profile data:</strong> email address, password (stored by our auth
            provider as a salted hash—we do not store your plaintext password), first and last name,
            profile photo, biography, Instagram handle, instructor specialties, teaching information,
            optional phone number, optional location fields (such as state, ZIP code, latitude/longitude
            for instructor map features), optional “prayer” or faith-related text you choose to display
            on a profile, newsletter preference, and role flags (such as student, instructor, admin).
          </li>
          <li>
            <strong>Event and class registration:</strong> name, email, attendance history answers,
            planned class level and dance role where required, payment method selection, payment and
            refund acknowledgments, liability release acceptance, promotional code usage, and related
            check-in identifiers (such as QR codes).
          </li>
          <li>
            <strong>Competition registration:</strong> registrant and partner names and email addresses,
            division selections, liability acceptance, payment status, and operational data for judges
            and scoring where applicable.
          </li>
          <li>
            <strong>Merchandise orders:</strong> name, email, shipping address (city, state, ZIP),
            delivery method, order line items, payment status, and preorder acknowledgments.
          </li>
          <li>
            <strong>Private lesson bookings:</strong> student name, email, phone number, lesson focus,
            instructor disclaimer acknowledgment, and scheduling details.
          </li>
          <li>
            <strong>Prayer requests:</strong> optional name, message content, and technical metadata
            (such as IP address for rate limiting). Prayer submissions are emailed to our team; we do
            not describe a separate prayer database table in our public application—treat message
            content as sensitive and share only with those who need it for pastoral care.
          </li>
          <li>
            <strong>Social / song-request features:</strong> authenticated user identifiers or an
            anonymous requester token stored in a cookie, song request history associated with that
            session or account, and abuse-prevention tokens (such as Cloudflare Turnstile).
          </li>
          <li>
            <strong>Payment data:</strong> we use Stripe to process card payments. We receive
            confirmation of payment, amounts, and metadata needed to fulfill orders and registrations;
            we do not store full card numbers on our servers.
          </li>
          <li>
            <strong>Technical and usage data:</strong> server logs, timestamps, IP addresses,
            user-agent strings, and similar data generated when you use the site. We do not currently
            deploy third-party advertising or analytics SDKs in our application code.
          </li>
          <li>
            <strong>Communications:</strong> content of emails we send you (confirmations, reminders,
            optional weekly schedule newsletters, administrative event updates) and emails you send us.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="sources" title="How we collect information">
        <ul className="list-disc pl-6 space-y-2">
          <li>Directly from you when you fill out forms, create an account, or communicate with us.</li>
          <li>Automatically through cookies, local storage, and server logs when you use the site.</li>
          <li>
            From payment processors (Stripe) when you complete a checkout session or webhook confirms
            payment.
          </li>
          <li>
            From authentication infrastructure (Supabase) when you verify your email, sign in, or reset
            your password.
          </li>
          <li>
            From administrators or instructors who use internal tools for events, teams, refunds, and
            operations.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="How we use information">
        <p>We use personal information for purposes that include:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Providing the Services: registrations, check-in, competitions, lessons, and merchandise fulfillment.</li>
          <li>Processing payments, refunds, and promotional pricing.</li>
          <li>
            Sending <strong>transactional</strong> emails and messages you reasonably expect from your
            request (registration confirmations, payment links, lesson notifications, schedule reminders
            for team members, competition operational messages).
          </li>
          <li>
            Sending <strong>marketing</strong> emails only where allowed—currently our weekly schedule
            newsletter is sent only to users who have turned on “weekly schedule email” in profile or
            opted in at event signup (when logged in).
          </li>
          <li>Displaying public instructor directories and profiles where you choose to publish fields.</li>
          <li>Operating DJ/social/music features and preventing abuse or fraud.</li>
          <li>Complying with law, enforcing our Terms, and protecting rights, safety, and property.</li>
          <li>Internal analytics and operations using aggregated or de-identified data where possible.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal information as “sell” is commonly defined under
          U.S. state privacy laws, and we do not buy email lists for marketing.
        </p>
      </LegalSection>

      <LegalSection id="legal-bases" title="Legal bases (EEA, UK, and similar jurisdictions)">
        <p>
          If you are in the European Economic Area, the United Kingdom, or another jurisdiction that
          requires a legal basis for processing, we rely on one or more of the following, depending on
          context:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Contract:</strong> processing necessary to register you for an event, fulfill an
            order, or provide an account you requested.
          </li>
          <li>
            <strong>Consent:</strong> for example optional weekly newsletter, optional public profile
            fields, and non-essential cookies where consent is required.
          </li>
          <li>
            <strong>Legitimate interests:</strong> securing the site, preventing fraud, organizing
            community events, and communicating about your existing registrations, balanced against your
            rights.
          </li>
          <li>
            <strong>Legal obligation:</strong> tax, payment, or regulatory records where applicable.
          </li>
        </ul>
        <p>You may withdraw consent where processing is consent-based without affecting prior lawful processing.</p>
      </LegalSection>

      <LegalSection id="share" title="Sharing, service providers, and disclosures">
        <p>We share information only as needed to operate the Services, including with:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Supabase</strong> (authentication, database hosting) — account and application data.
          </li>
          <li>
            <strong>Resend</strong> (email delivery) — recipient addresses and message content for emails
            we send.
          </li>
          <li>
            <strong>Stripe</strong> (payments) — transaction and customer details required to charge and
            reconcile payments.
          </li>
          <li>
            <strong>Vercel</strong> (hosting and scheduled jobs such as newsletter sends).
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> (bot protection on select forms).
          </li>
          <li>
            <strong>Google</strong> (Google Drive APIs where used for media gallery features) — per
            configuration and your interaction with those features.
          </li>
          <li>
            <strong>Spotify / Apple Music</strong> integrations where you or administrators connect
            music features — governed also by those providers’ terms.
          </li>
          <li>
            <strong>Instructors and team members</strong> with a legitimate need (for example lesson
            bookings, event operations, prayer care).
          </li>
          <li>
            <strong>Venue or competition partners</strong> when you register for events they host or
            co-sponsor and sharing is necessary for that event (disclosed at registration where
            applicable).
          </li>
          <li>
            <strong>Law enforcement or others</strong> when required by law or to protect rights and
            safety.
          </li>
        </ul>
        <p>
          We require service providers to handle data under contractual obligations appropriate to their
          role. We do not authorize them to use your data for their own unrelated marketing.
        </p>
      </LegalSection>

      <LegalSection id="email" title="Email and marketing choices">
        <p>
          <strong>Transactional email:</strong> If you register for an event, place an order, book a
          lesson, or create an account, we may send emails about that transaction (confirmation, payment,
          schedule changes related to your registration, lesson details). These are not the same as our
          optional marketing newsletter.
        </p>
        <p>
          <strong>Weekly schedule newsletter:</strong> Sent on a recurring schedule to users who have
          opted in via profile settings or an optional checkbox at event signup (when signed in). Each
          newsletter includes an unsubscribe link that works without logging in.
        </p>
        <p>
          <strong>Administrative event emails:</strong> Organizers may email registrants about a specific
          event they signed up for (for example venue or time changes). If content is promotional rather
          than related to your registration, we aim to apply marketing rules; counsel may refine this
          practice.
        </p>
        <p>
          <strong>SMS:</strong> We do not currently send marketing text messages through the website.
          If we collect your phone number, it is for lesson coordination, account contact, or display
          on your instructor profile when you choose to publish it—not for automated marketing texts
          unless we separately obtain consent required by law.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies, local storage, and similar technologies">
        <p>
          We use cookies and browser storage for essential and functional purposes. Details are in our{" "}
          <a href="/cookies" className="text-primary underline">
            Cookie Policy
          </a>
          . You can control cookies through your browser; blocking some cookies may break features
          (cart, social song requests, OAuth flows).
        </p>
      </LegalSection>

      <LegalSection id="public" title="Public profiles, photos, and video">
        <p>
          Instructor profiles may display information you enter (name, photo, bio, Instagram, phone,
          location region, etc.). Treat those fields as <strong>public</strong> when published.
        </p>
        <p>
          Event and competition registration may include acknowledgment of photography or promotional
          use. Releases are presented at signup; counsel should align on-field language with Tennessee
          law and venue agreements.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep information">
        <p>
          We keep information as long as needed for the purposes above, including fulfilling
          registrations, finance and tax records, competition history, dispute resolution, and security.
          Specific retention periods may vary by data type; counsel may formalize a schedule. When data is
          no longer needed, we delete or de-identify it where feasible.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          We use industry-standard measures such as HTTPS, hosted authentication, access controls for
          administrative functions, and secrets management in our hosting environment. No method of
          transmission or storage is completely secure; we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          The Services are intended for a general audience and are not directed at children under 13. We
          do not knowingly collect personal information from children under 13 without appropriate
          parental consent. If you believe a child has provided us information, contact us and we will
          take appropriate steps. Minors attending classes may be subject to parent/guardian releases as
          required at events (counsel to advise).
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights and choices">
        <p>Depending on where you live, you may have the right to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Access, correct, or delete certain personal information.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Portability of data you provided.</li>
          <li>Withdraw consent (for example newsletter opt-in via profile or unsubscribe link).</li>
          <li>Opt out of marketing emails via unsubscribe or profile settings.</li>
        </ul>
        <p>
          To request access, correction, or deletion, email{" "}
          <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a> from the email address
          associated with your account, or explain your relationship to the data if you do not have an
          account. We may need to verify your identity. Signed-in users may delete their account under{" "}
          <a href="/settings" className="text-primary underline">
            Settings
          </a>
          . For guest registration or order data, contact us.
        </p>
      </LegalSection>

      <LegalSection id="us-states" title="U.S. state-specific notices">
        <p>
          <strong>California (CCPA/CPRA):</strong> California residents may have rights to know, delete,
          and correct personal information, and to limit certain uses. We do not sell personal information.
          Submit requests to {LEGAL_PRIVACY_EMAIL}. We will not discriminate against you for exercising
          privacy rights.
        </p>
        <p>
          <strong>Other states:</strong> Several U.S. states have enacted comprehensive privacy laws.
          We honor applicable rights for residents of those states when we can verify requests. Tennessee
          residents may contact us with any privacy concerns under applicable state law.
        </p>
      </LegalSection>

      <LegalSection id="international" title="International visitors">
        <p>
          We are based in the United States. If you access the Services from outside the U.S., you
          understand that your information may be processed in the U.S. and other countries where our
          providers operate, which may have different data protection rules than your country.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          We may update this Privacy Policy to reflect operational, legal, or technical changes. We
          will post the updated policy on this page and update the “Last updated” date. Material changes
          may be communicated by email or a site notice where appropriate.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact us">
        <p>
          {LEGAL_SITE_NAME}
          <br />
          {LEGAL_CITY_REGION}
          <br />
          Email: <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
