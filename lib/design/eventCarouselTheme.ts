import { colors } from "@/lib/design/tokens";
import {
  isCityLightsTitle,
  isDnaTitle,
  isNashvilleNightTitle,
} from "@/lib/nashvilleEventTitle";

export type EventCarouselThemeKey =
  | "ncsn"
  | "cityLights"
  | "dna"
  | "comp"
  | "workshop"
  | "default";

export type EventCarouselTheme = {
  key: EventCarouselThemeKey;
  titleColor: string;
  borderColor: string;
  titleGlow: string;
  titleGlowPeek: string;
};

const THEME_COLORS: Record<
  EventCarouselThemeKey,
  { titleColor: string; borderColor: string; rgb: string }
> = {
  ncsn: {
    titleColor: colors.eventTitle,
    borderColor: colors.eventTitle,
    rgb: "103, 232, 249",
  },
  cityLights: {
    titleColor: colors.accent,
    borderColor: colors.accent,
    rgb: "187, 134, 252",
  },
  dna: {
    titleColor: colors.brandDna,
    borderColor: colors.brandDna,
    rgb: "43, 201, 41",
  },
  comp: {
    titleColor: colors.brandComps,
    borderColor: colors.brandComps,
    rgb: "242, 201, 76",
  },
  workshop: {
    titleColor: colors.brandNcsn,
    borderColor: colors.brandNcsn,
    rgb: "65, 105, 225",
  },
  default: {
    titleColor: colors.gold,
    borderColor: colors.gold,
    rgb: "242, 201, 76",
  },
};

function glowForRgb(rgb: string, strong: boolean): string {
  if (strong) {
    return `0 0 12px rgba(${rgb}, 0.85), 0 0 24px rgba(${rgb}, 0.45)`;
  }
  return `0 0 6px rgba(${rgb}, 0.35)`;
}

function themeFromKey(key: EventCarouselThemeKey): EventCarouselTheme {
  const c = THEME_COLORS[key];
  return {
    key,
    titleColor: c.titleColor,
    borderColor: c.borderColor,
    titleGlow: glowForRgb(c.rgb, true),
    titleGlowPeek: glowForRgb(c.rgb, false),
  };
}

function resolveKeyFromType(type: string | null | undefined): EventCarouselThemeKey | null {
  const t = (type ?? "").trim().toLowerCase();
  switch (t) {
    case "class":
      return "ncsn";
    case "social":
      return "cityLights";
    case "convention":
      return "dna";
    case "comp":
      return "comp";
    case "workshop":
      return "workshop";
    default:
      return null;
  }
}

function resolveKeyFromTitle(title: string | null | undefined): EventCarouselThemeKey | null {
  if (isNashvilleNightTitle(title)) return "ncsn";
  if (isCityLightsTitle(title)) return "cityLights";
  if (isDnaTitle(title)) return "dna";
  return null;
}

export type EventCarouselThemeInput = {
  type?: string | null;
  title?: string | null;
};

/** Type first; title heuristics when type is missing or unrecognized. */
export function resolveEventCarouselTheme(input: EventCarouselThemeInput): EventCarouselTheme {
  const fromType = resolveKeyFromType(input.type);
  if (fromType) return themeFromKey(fromType);

  const fromTitle = resolveKeyFromTitle(input.title);
  if (fromTitle) return themeFromKey(fromTitle);

  return themeFromKey("default");
}
