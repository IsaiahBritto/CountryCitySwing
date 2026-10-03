import { describe, expect, it } from "vitest";
import { filterBioVisiblePlaylistLinks } from "@/lib/theSocialPlaylistLinksFilter";
import type { ExternalPlaylistLink } from "@/lib/bioLinks";

function link(id: string): ExternalPlaylistLink {
  return {
    id,
    label: id,
    href: "https://open.spotify.com/playlist/example",
  };
}

describe("filterBioVisiblePlaylistLinks", () => {
  it("removes waltz-playlist only", () => {
    const input = [
      link("country-swing-playlist"),
      link("waltz-playlist"),
      link("two-step"),
    ];
    expect(filterBioVisiblePlaylistLinks(input)).toEqual([
      link("country-swing-playlist"),
      link("two-step"),
    ]);
  });

  it("preserves order when waltz is absent", () => {
    const input = [
      link("country-swing-playlist"),
      link("west-coast-swing-playlist"),
    ];
    expect(filterBioVisiblePlaylistLinks(input)).toEqual(input);
  });
});
