import {
  DEFAULT_THE_SOCIAL_PLAYLIST_LINKS,
  type ExternalPlaylistLink,
} from "@/lib/bioLinks";
import { supabaseServer } from "@/lib/supabaseServer";

export type { ExternalPlaylistLink };

export type TheSocialPlaylistLinkInput = {
  id?: string;
  label: string;
  href: string;
};

export function slugifyLinkId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "link";
}

export function isValidHttpUrl(href: string): boolean {
  try {
    const url = new URL(href.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateTheSocialPlaylistLinks(
  links: unknown
): { ok: true; links: TheSocialPlaylistLinkInput[] } | { ok: false; error: string } {
  if (!Array.isArray(links)) {
    return { ok: false, error: "links must be an array" };
  }

  const normalized: TheSocialPlaylistLinkInput[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < links.length; i++) {
    const row = links[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `Link ${i + 1} is invalid` };
    }

    const label = typeof (row as TheSocialPlaylistLinkInput).label === "string"
      ? (row as TheSocialPlaylistLinkInput).label.trim()
      : "";
    const href = typeof (row as TheSocialPlaylistLinkInput).href === "string"
      ? (row as TheSocialPlaylistLinkInput).href.trim()
      : "";

    if (!label) {
      return { ok: false, error: `Link ${i + 1} is missing a label` };
    }
    if (!href) {
      return { ok: false, error: `Link ${i + 1} is missing a URL` };
    }
    if (!isValidHttpUrl(href)) {
      return { ok: false, error: `Link ${i + 1} must be a valid http(s) URL` };
    }

    let id =
      typeof (row as TheSocialPlaylistLinkInput).id === "string" &&
      (row as TheSocialPlaylistLinkInput).id!.trim()
        ? (row as TheSocialPlaylistLinkInput).id!.trim()
        : slugifyLinkId(label);

    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) suffix++;
      id = `${id}-${suffix}`;
    }
    usedIds.add(id);

    normalized.push({ id, label, href });
  }

  return { ok: true, links: normalized };
}

function mapRows(rows: { id: string; label: string; href: string }[]): ExternalPlaylistLink[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    href: row.href,
  }));
}

export async function getTheSocialPlaylistLinks(): Promise<ExternalPlaylistLink[]> {
  try {
    const { data, error } = await supabaseServer
      .from("the_social_playlist_links")
      .select("id, label, href")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching the social playlist links:", error);
      return DEFAULT_THE_SOCIAL_PLAYLIST_LINKS;
    }

    if (!data?.length) {
      return DEFAULT_THE_SOCIAL_PLAYLIST_LINKS;
    }

    return mapRows(data);
  } catch (error) {
    console.error("Error fetching the social playlist links:", error);
    return DEFAULT_THE_SOCIAL_PLAYLIST_LINKS;
  }
}

export async function replaceTheSocialPlaylistLinks(
  links: TheSocialPlaylistLinkInput[]
): Promise<ExternalPlaylistLink[]> {
  const validated = validateTheSocialPlaylistLinks(links);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const rows = validated.links.map((link, index) => ({
    id: link.id!,
    label: link.label,
    href: link.href,
    sort_order: index,
    updated_at: new Date().toISOString(),
  }));

  const newIds = rows.map((row) => row.id);

  const { data: existing, error: existingError } = await supabaseServer
    .from("the_social_playlist_links")
    .select("id");

  if (existingError) {
    throw new Error("Failed to load existing playlist links");
  }

  const idsToDelete = (existing ?? [])
    .map((row) => row.id)
    .filter((id) => !newIds.includes(id));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabaseServer
      .from("the_social_playlist_links")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      throw new Error("Failed to remove old playlist links");
    }
  }

  const { error: upsertError } = await supabaseServer
    .from("the_social_playlist_links")
    .upsert(rows, { onConflict: "id" });

  if (upsertError) {
    throw new Error("Failed to save playlist links");
  }

  return mapRows(rows);
}
