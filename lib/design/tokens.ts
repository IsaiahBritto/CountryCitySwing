/**
 * Design tokens mirror (authoritative CSS: app/styles/tokens.css).
 * Use for runtime theming — do not add one-off brand hex elsewhere.
 */

export const colors = {
  gold: "#F2C94C",
  goldBright: "#FFD84E",
  goldHover: "#FFE375",
  accent: "#BB86FC",
  accentHover: "#CF9FFF",
  pinkCta: "#E879F9",
  pinkCtaHover: "#F0ABFC",

  bg: "#0D0D0D",
  bgNav: "#111218",
  bgElevated: "#1A1A1A",
  border: "#2A2A2A",
  text: "#E5E5E5",
  textMuted: "#A3A3A3",
  white: "#FFFFFF",
  black: "#000000",

  surfaceTeam: "#3D3D2D",

  brandNcsn: "#4169E1",
  brandCityLights: "#D4D4D4",
  brandDna: "#2BC929",
  brandDnaHover: "#32E032",
  brandComps: "#F2C94C",

  eventTitle: "#67E8F9",
} as const;

export type BrandAccentKey = "default" | "ncsn" | "cityLights" | "dna" | "comps";

export const brandAccents: Record<
  BrandAccentKey,
  { hex: string; rgb: readonly [number, number, number] }
> = {
  default: { hex: colors.gold, rgb: [242, 201, 76] },
  ncsn: { hex: colors.brandNcsn, rgb: [65, 105, 225] },
  cityLights: { hex: colors.brandCityLights, rgb: [212, 212, 212] },
  dna: { hex: colors.brandDna, rgb: [43, 201, 41] },
  comps: { hex: colors.brandComps, rgb: [242, 201, 76] },
};

export const navThemes = {
  default: brandAccents.default,
  dna: brandAccents.dna,
  eventsScroll: brandAccents.default,
} as const;

export const eventTypeColors = {
  comp: colors.brandDna,
  convention: colors.goldBright,
  workshop: colors.brandNcsn,
  default: colors.gold,
} as const;

export const typography = {
  fontSans: "var(--font-sans)",
  fontDisplay: "var(--font-display)",
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
} as const;

export const radii = {
  sm: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
} as const;
