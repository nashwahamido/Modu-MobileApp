import { Dimensions, StyleSheet, useWindowDimensions } from "react-native";
import { createContext, useContext, useMemo } from "react";
import type { TextStyle } from "react-native";
import { ThemeId } from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";

const PALETTE = {
  ink900: "#1b1819", // backdrop
  ink800: "#231e1d", // panel / card
  ink700: "#2b2523", // card, one step up
  ink600: "#38322f", // raised: active segment, pressed
  ink500: "#5a5451", // hairline

  paper100: "#faf7f1", // the light theme's backdrop
  paper200: "#F5EADD", // light: cards, icon buttons, an UNPRESSED action button — the cream from the joystick dial
  paper300: "#e6ddcd", // light: raised
  paper400: "#cfc3ae", // light: hairline
  linen: "#EDE7DD",
  lilac: "#A996C2",

  lavender: "#8d799f",
  lavenderDim: "#79668b",
  lavenderLift: "#a992ba",
  lavenderLight: "#8D7BA8",

  sage: "#7d8b6e",
  sageDim: "#6b7860",

  gold: "#cca16c",

  bone: "#f3efe8",
  stone: "#a99e96",
  stoneDim: "#7d746c",

  clay: "#c2705a",
} as const;

export interface Theme {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceInset: string;
  border: string;
  borderStrong: string;

  text: string;
  textDim: string;
  textFaint: string;

  accent: string;
  accentPressed: string;
  onAccent: string;

  success: string;
  onSuccess: string;

  gold: string;

  danger: string;

  scrim: string;
}

const DARK: Theme = {
  bg: PALETTE.ink900,
  surface: "rgba(74,66,62,0.99)",
  surfaceRaised: "rgba(96,86,80,0.99)",
  surfaceInset: "rgba(0,0,0,0.30)",
  border: "rgba(243,239,232,0.08)",
  borderStrong: "rgba(243,239,232,0.16)",

  text: PALETTE.bone,
  textDim: PALETTE.stone,
  textFaint: PALETTE.stoneDim,

  accent: PALETTE.lavenderLight,
  accentPressed: PALETTE.lavenderDim,
  onAccent: "#ffffff",

  success: PALETTE.sage,
  onSuccess: "#f7f9f3",

  gold: PALETTE.gold,
  danger: PALETTE.clay,
  scrim: "rgba(15,12,12,0.72)",
};

const LIGHT: Theme = {
  bg: PALETTE.paper100,
  surface: PALETTE.paper200,
  surfaceRaised: PALETTE.paper300,
  surfaceInset: "rgba(60,50,40,0.10)",
  border: "rgba(60,50,40,0.12)",
  borderStrong: "rgba(60,50,40,0.22)",

  text: "#231F20",
  textDim: "#6f665c",
  textFaint: "#9a9086",

  accent: PALETTE.lavenderLight,
  accentPressed: PALETTE.lilac,
  onAccent: PALETTE.linen,

  success: PALETTE.sageDim,
  onSuccess: PALETTE.linen,

  gold: "#a9762f",
  danger: "#a8543f",
  scrim: "rgba(30,25,22,0.45)",
};

const HIGH_CONTRAST: Theme = {
  ...DARK,
  bg: "#000000",
  surface: "#141112",
  surfaceRaised: "#2c2624",
  border: "rgba(255,255,255,0.28)",
  borderStrong: "rgba(255,255,255,0.55)",
  text: "#ffffff",
  textDim: "#ddd6cd",
  textFaint: "#b0a89f",
  accent: PALETTE.lavenderLight,
  accentPressed: PALETTE.lavender,
  success: "#9db488",
  gold: "#e8bd80",
};

export const ACCENT_LIGHT = PALETTE.lavenderLight;

export const CONTROL = {
  fill: PALETTE.lavenderLight,
  ink: "#6A548B",
  track: "rgba(60,50,40,0.13)",
  fillSoft: "rgba(141, 123, 168, 0.25)",
} as const;

export const CREAM = {
  ink: "#231F20",
  inkDim: "rgba(35,31,32,0.62)",
  card: "#FBFAF3",
  chrome: "#F7F0E6",
  activeTile: "#D3CBD2",
  navActive: "#E4D9C9",
  hairline: "#D7D1CE",
  hairlineWidth: 0.4,
  badgeGlow: "#FFFCF7",
  darkChip: "#3D3A38",
} as const;

export const CARD_CHROME = {
  borderWidth: StyleSheet.hairlineWidth * 2,
  borderColor: "rgba(60,50,40,0.12)",
  boxShadow: "0px 5px 4px rgba(0,0,0,0.22)",
  shadowColor: "#000",
  shadowOpacity: 0.45,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

export const CREAM_LIFT = {
  panel: {
    shadowColor: "#929292",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  card: {
    shadowColor: "#929292",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  control: {
    shadowColor: "#929292",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chip: {
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
} as const;

export const THEMES: Record<ThemeId, Theme> = {
  light: LIGHT,
  dark: DARK,
  high_contrast: HIGH_CONTRAST,
};

const ThemeOverride = createContext<ThemeId | null>(null);

export const ThemeScope = ThemeOverride.Provider;

export function useThemeId(): ThemeId {
  const scoped = useContext(ThemeOverride);
  const app = usePrefsStore((s) => s.theme);
  return scoped ?? app;
}

export function useTheme(): Theme {
  return THEMES[useThemeId()];
}

export function useStyles<T extends object>(make: (theme: Theme) => T): T {
  const theme = useTheme();
  const k = useUiScale();
  return useMemo(() => scaleSheet(make(theme), k), [make, theme, k]);
}

export function useScaledStyles<T extends object>(make: (theme: Theme) => T, k: number): T {
  const theme = useTheme();
  return useMemo(() => scaleSheet(make(theme), k), [make, theme, k]);
}

export function useFixedStyles<T extends object>(make: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => make(theme), [make, theme]);
}

export function useUiScale(): number {
  const { width, height } = useWindowDimensions();
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (short < TABLET_MIN_SHORT_DP) return 1;
  return Math.max(1, Math.min(MAX_UI_SCALE, short / PHONE_SHORT_DP, long / PHONE_LONG_DP));
}

const PHONE_SHORT_DP = 360;
const PHONE_LONG_DP = 800;
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_MIN_SHORT_DP;
}

export function isTabletScreen(): boolean {
  const { width, height } = Dimensions.get("window");
  return Math.min(width, height) >= TABLET_MIN_SHORT_DP;
}

const TABLET_MIN_SHORT_DP = 600;
const MAX_UI_SCALE = 1.75;

const SCALED_PROPS = new Set([
  "fontSize",
  "lineHeight",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "borderRadius",
  "padding",
  "paddingHorizontal",
  "paddingVertical",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "margin",
  "marginHorizontal",
  "marginVertical",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "gap",
  "rowGap",
  "columnGap",
]);

function scaleSheet<T extends object>(sheet: T, k: number): T {
  if (k === 1) return sheet;
  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(sheet)) {
    if (!style || typeof style !== "object") {
      out[name] = style;
      continue;
    }
    const next: Record<string, unknown> = {};
    for (const [prop, value] of Object.entries(style as Record<string, unknown>)) {
      next[prop] =
        typeof value === "number" && SCALED_PROPS.has(prop)
          ? Math.round(value * k)
          : value;
    }
    out[name] = next;
  }
  return out as T;
}

export const RADIUS = {
  control: 14,
  panel: 20,
  pill: 999,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const ELEVATION = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  raised: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const;

export const SIZE = {
  controlHeight: 44,
  controlHeightSm: 36,
  fab: 60,
  icon: 20,
} as const;

export const FONT = "Lexend";

export const LEXEND = {
  regular: { fontFamily: FONT, fontWeight: "400" },
  medium: { fontFamily: FONT, fontWeight: "500" },
  semibold: { fontFamily: FONT, fontWeight: "600" },
  bold: { fontFamily: FONT, fontWeight: "700" },
  extrabold: { fontFamily: FONT, fontWeight: "800" },
  black: { fontFamily: FONT, fontWeight: "900" },
} as const satisfies Record<string, TextStyle>;

export const TYPE: Record<
  "label" | "labelSm" | "body" | "title" | "numeric",
  TextStyle
> = {
  label: { ...LEXEND.bold, fontSize: 14 },
  labelSm: { ...LEXEND.bold, fontSize: 12 },
  body: { ...LEXEND.medium, fontSize: 14 },
  title: { ...LEXEND.extrabold, fontSize: 18 },
  numeric: { ...LEXEND.bold, fontSize: 13, fontVariant: ["tabular-nums"] },
};