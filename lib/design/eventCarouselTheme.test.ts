import { describe, expect, it } from "vitest";
import { resolveEventCarouselTheme } from "./eventCarouselTheme";
import { colors } from "./tokens";

describe("resolveEventCarouselTheme", () => {
  it("maps Class type to NCSN cyan", () => {
    const t = resolveEventCarouselTheme({ type: "Class", title: "Anything" });
    expect(t.key).toBe("ncsn");
    expect(t.titleColor).toBe(colors.eventTitle);
  });

  it("maps Social type to city lights purple", () => {
    const t = resolveEventCarouselTheme({ type: "Social", title: "Weekly Dance" });
    expect(t.key).toBe("cityLights");
    expect(t.titleColor).toBe(colors.accent);
  });

  it("maps Convention type to DNA green", () => {
    const t = resolveEventCarouselTheme({ type: "Convention", title: "Some Con" });
    expect(t.key).toBe("dna");
    expect(t.titleColor).toBe(colors.brandDna);
  });

  it("maps Comp and Workshop types", () => {
    expect(resolveEventCarouselTheme({ type: "Comp" }).key).toBe("comp");
    expect(resolveEventCarouselTheme({ type: "Workshop" }).key).toBe("workshop");
  });

  it("uses title fallback when type is unknown", () => {
    expect(
      resolveEventCarouselTheme({ title: "Nashville Country Swing Nights!" }).key
    ).toBe("ncsn");
    expect(resolveEventCarouselTheme({ title: "City Light Social" }).key).toBe(
      "cityLights"
    );
    expect(resolveEventCarouselTheme({ title: "Dance Nash Aftermath" }).key).toBe(
      "dna"
    );
  });

  it("defaults when type and title are unrecognized", () => {
    const t = resolveEventCarouselTheme({ type: "", title: "Random Meetup" });
    expect(t.key).toBe("default");
    expect(t.titleColor).toBe(colors.gold);
  });

  it("prefers type over conflicting title", () => {
    const t = resolveEventCarouselTheme({
      type: "Social",
      title: "Nashville Country Swing Nights!",
    });
    expect(t.key).toBe("cityLights");
  });
});
