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

export const THE_SOCIAL_SECTION_TITLE = "The Social.";

export interface ExternalPlaylistLink {
  id: string;
  label: string;
  href: string;
}

export const DEFAULT_THE_SOCIAL_PLAYLIST_LINKS: ExternalPlaylistLink[] = [
  {
    id: "country-swing-playlist",
    label: "Country Swing Playlist",
    href: "https://open.spotify.com/playlist/4FtXSbbhvWrGm9CH0kkxzn?si=aAe9nVMKRkWMzbgiz4dFXw&pi=9dPqoJoAT9W0y&pt=f870754a07d5aa3bc3f420b48df30d12",
  },
  {
    id: "west-coast-swing-playlist",
    label: "West Coast Swing Playlist",
    href: "https://open.spotify.com/playlist/4eRJZ0KSiK5Rdjp7iVOTbm?si=l6Y6sUEcRkmo35uSEjR0Sg&pt=01a03c5f0f49f1ae6d56c4e1aee5a058&pi=zQgCo5PuR8mKj",
  },
  {
    id: "line-dance-playlist",
    label: "Line Dance Playlist",
    href: "https://open.spotify.com/playlist/2QHnuDywacKhgKZTScSpC7?si=6XAc15WmQZCsMADENP8nHw&pt=574b2357938dee8e4390415f14763ce8&pi=_PESQqtLRQ-vm",
  },
  {
    id: "two-step-playlist",
    label: "Two Step Playlist",
    href: "https://open.spotify.com/playlist/placeholderTwoStep00000000",
  },
];

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

/** Append Instagram bio UTM params to external URLs (e.g. Spotify). */
export function withBioExternalUtm(href: string, campaign?: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set("utm_source", "instagram");
    url.searchParams.set("utm_medium", "bio");
    if (campaign) url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return href;
  }
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
