# Legal pages — notes for counsel

## Thorough vs. vague

For attorney review, **specific and accurate** policy language is preferable to generic “cover everything” boilerplate that does not match how the site actually works. Courts and regulators care whether practices match disclosures. These drafts describe **observed behavior** in the Country City Swing codebase (forms, emails, processors, cookies).

Counsel should:

1. Confirm or correct **entity name(s)** and whether releases at signup match the correct operator for each venue (e.g. Dance Nashville rental space vs. competition hospitality entities).
2. Designate a **CAN-SPAM-compliant postal mailing address** (PO Box or principal business address). Do **not** use 630 Rundle Ave as a mailing address unless it is legally appropriate—it is described in policies as an **occasional event venue**, not necessarily the organization’s principal place of business.
3. Set `NEXT_PUBLIC_LEGAL_MAILING_ADDRESS` in production once the address is final (marketing email footers and policies will pick it up automatically).
4. Review **limitation of liability**, **indemnity**, **governing law**, and interplay with **on-site liability waivers**.
5. Remove or revise the yellow **“Draft for legal review”** banner in [`components/legal/LegalDocumentLayout.tsx`](../../components/legal/LegalDocumentLayout.tsx) when policies are final.

## Site routes

| Route | File |
|-------|------|
| `/privacy` | [`app/privacy/page.tsx`](../../app/privacy/page.tsx) |
| `/terms` | [`app/terms/page.tsx`](../../app/terms/page.tsx) |
| `/cookies` | [`app/cookies/page.tsx`](../../app/cookies/page.tsx) |

Shared constants: [`lib/legal/constants.ts`](../../lib/legal/constants.ts).

## Recent product/legal alignment changes

- Event signup waiver no longer claims automatic marketing list enrollment; weekly email remains explicit opt-in.
- Newsletter and transactional emails link to Privacy Policy; marketing footers use shared builder in [`lib/email/legalFooter.ts`](../../lib/email/legalFooter.ts).
