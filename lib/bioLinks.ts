/**
 * Link-in-bio configuration for /links.
 *
 * UTM params (utm_source=instagram, utm_medium=bio, utm_campaign=<id>)
 * are appended to internal links only — filter by campaign in analytics
 * to see which bio button drove traffic.
 */

import {
  INSTAGRAM_HANDLE,
  instagramProfileUrl,
} from "./socialLinks";

export const BIO_TAGLINE =
  "Nashville's home for joyful Country Swing partner dancing.";

export const BIO_FOOTER_LINE = "Country City Swing · Nashville, TN";

export type BioLinkVariant = "primary" | "accent" | "ghost";

export interface BioLink {
  id: string;
  label: string;
  href: string;
  variant: BioLinkVariant;
  external?: boolean;
}

export const bioLinks: BioLink[] = [
  {
    id: "events",
    label: "Sign Up for Events",
    href: "/#events",
    variant: "primary",
  },
  {
    id: "merch",
    label: "Shop Merch",
    href: "/merch",
    variant: "accent",
  },
  {
    id: "prayer",
    label: "Prayer Request",
    href: "/prayer",
    variant: "accent",
  },
  {
    id: "about",
    label: "About Country City Swing",
    href: "/about",
    variant: "ghost",
  },
];

export interface BioSocialLink {
  id: string;
  label: string;
  href: string;
  handle: string;
}

export function getBioSocialLinks(): BioSocialLink[] {
  return [
    {
      id: "instagram",
      label: "Instagram",
      href: instagramProfileUrl(),
      handle: `@${INSTAGRAM_HANDLE}`,
    },
  ];
}

function isInternalHref(href: string): boolean {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return false;
  }
  return href.startsWith("/") || href.startsWith("#");
}

/** Append Instagram bio UTM params to internal paths only. */
export function withBioUtm(href: string, campaign?: string): string {
  if (!isInternalHref(href)) return href;

  const [pathAndQuery, hash = ""] = href.split("#");
  const [pathname, existingQuery = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set("utm_source", "instagram");
  params.set("utm_medium", "bio");
  if (campaign) params.set("utm_campaign", campaign);

  const query = params.toString();
  const withQuery = query ? `${pathname}?${query}` : pathname;
  return hash ? `${withQuery}#${hash}` : withQuery;
}
