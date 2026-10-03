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

export type EventCarouselSignupStyle = {
  background: string;
  backgroundHover: string;
  color: string;
  borderColor: string;
  shadow: string;
  shadowHover: string;
};

export type EventCarouselTheme = {
  key: EventCarouselThemeKey;
  titleColor: string;
  borderColor: string;
  titleGlow: string;
  titleGlowPeek: string;
  signup: EventCarouselSignupStyle;
};

const THEME_COLORS: Record<
  EventCarouselThemeKey,
  {
    titleColor: string;
    borderColor: string;
    rgb: string;
    signup: EventCarouselSignupStyle;
  }
> = {
  ncsn: {
    titleColor: colors.eventTitle,
    borderColor: colors.eventTitle,
    rgb: "103, 232, 249",
    signup: {
      background: colors.eventTitle,
      backgroundHover: "#8ef6ff",
      color: colors.black,
      borderColor: "rgba(103, 232, 249, 0.65)",
      shadow: "0 0 16px rgba(103, 232, 249, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
      shadowHover: "0 0 24px rgba(103, 232, 249, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.45)",
    },
  },
  cityLights: {
    titleColor: colors.accent,
    borderColor: colors.accent,
    rgb: "187, 134, 252",
    signup: {
      background: colors.accent,
      backgroundHover: colors.accentHover,
      color: colors.black,
      borderColor: "rgba(187, 134, 252, 0.65)",
      shadow: "0 0 16px rgba(187, 134, 252, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
      shadowHover: "0 0 26px rgba(187, 134, 252, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
    },
  },
  dna: {
    titleColor: colors.brandDna,
    borderColor: colors.brandDna,
    rgb: "43, 201, 41",
    signup: {
      background: colors.brandDna,
      backgroundHover: colors.brandDnaHover,
      color: colors.black,
      borderColor: "rgba(43, 201, 41, 0.65)",
      shadow: "0 0 16px rgba(43, 201, 41, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
      shadowHover: "0 0 24px rgba(43, 201, 41, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
    },
  },
  comp: {
    titleColor: colors.brandComps,
    borderColor: colors.brandComps,
    rgb: "242, 201, 76",
    signup: {
      background: colors.brandComps,
      backgroundHover: colors.goldHover,
      color: colors.black,
      borderColor: "rgba(242, 201, 76, 0.65)",
      shadow: "0 0 16px rgba(242, 201, 76, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
      shadowHover: "0 0 26px rgba(242, 201, 76, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.45)",
    },
  },
  workshop: {
    titleColor: colors.brandNcsn,
    borderColor: colors.brandNcsn,
    rgb: "65, 105, 225",
    signup: {
      background: colors.brandNcsn,
      backgroundHover: "#5a7ef0",
      color: colors.white,
      borderColor: "rgba(65, 105, 225, 0.65)",
      shadow: "0 0 16px rgba(65, 105, 225, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
      shadowHover: "0 0 24px rgba(65, 105, 225, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    },
  },
  default: {
    titleColor: colors.gold,
    borderColor: colors.gold,
    rgb: "242, 201, 76",
    signup: {
      background: colors.gold,
      backgroundHover: colors.goldHover,
      color: colors.black,
      borderColor: "rgba(242, 201, 76, 0.65)",
      shadow: "0 0 16px rgba(242, 201, 76, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
      shadowHover: "0 0 26px rgba(242, 201, 76, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.45)",
    },
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
    signup: c.signup,
  };
}

/** CSS custom properties for `.event-carousel-signup-btn`. */
export function eventCarouselSignupStyleVars(
  theme: EventCarouselTheme
): Record<string, string> {
  const s = theme.signup;
  return {
    "--ecs-signup-bg": s.background,
    "--ecs-signup-bg-hover": s.backgroundHover,
    "--ecs-signup-fg": s.color,
    "--ecs-signup-border": s.borderColor,
    "--ecs-signup-shadow": s.shadow,
    "--ecs-signup-shadow-hover": s.shadowHover,
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
