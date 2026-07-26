// The design tokens. Every colour, radius, and shadow in the UI comes from here.
//
// The palette is SAMPLED from the reference mockup, not eyeballed — the hexes below are
// the medians of the actual pixel clusters in it.
//
// The character of it, so it doesn't get lost in a later edit:
//
//   The near-black is WARM. #1b1819, not #181818 — brown-shifted, so it sits in the same
//   family as the pine and the workbench rather than reading as generic dark mode. Every
//   surface above it keeps that same warm shift.
//
//   The accent is a MUTED, dusty lavender. Desaturated on purpose: a saturated purple
//   would fight the wood, and the wood is the thing the player is looking at. The UI's
//   job is to stay quiet around it.
//
//   Three accents, three meanings, no overlap. Lavender = interactive (press this).
//   Green = complete (you did this). Gold = earned (XP, score). If a fourth meaning shows
//   up, it does NOT get a fourth colour — it gets a shape or a position.

import { useMemo } from "react";
import type { TextStyle } from "react-native";
import { ThemeId } from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";

// ── the raw palette ─────────────────────────────────────────────────────────
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
  /** Text on a FILLED button. Not pure white — it belongs to the same warm family as the
   *  paper, so a filled button reads as part of the set rather than a hole punched in it. */
  linen: "#EDE7DD",
  /** A pressed action button, light mode. Lighter than the resting accent, because in this
   *  language "raised" means live: a pressed control lifts toward the light. */
  lilac: "#A996C2",

  lavender: "#8d799f",
  lavenderDim: "#79668b",
  lavenderLift: "#a992ba",
  /** The interactive lavender for LIGHT mode: buttons, the joystick knob, any control that
   *  can be pressed. One colour, one meaning. */
  lavenderLight: "#8D7BA8",

  sage: "#7d8b6e",
  sageDim: "#6b7860",

  gold: "#cca16c",

  bone: "#f3efe8",
  stone: "#a99e96",
  stoneDim: "#7d746c",

  clay: "#c2705a", // destructive / blocked. Used sparingly — see below.
} as const;

export interface Theme {
  bg: string;
  /** Panels and cards. */
  surface: string;
  /** A card sitting ON a panel, or a pressed button. */
  surfaceRaised: string;
  /** An inset track: a progress bar, a segmented control's groove. */
  surfaceInset: string;
  border: string;
  borderStrong: string;

  text: string;
  textDim: string;
  textFaint: string;

  /** INTERACTIVE. The one colour that means "you can press this". */
  accent: string;
  accentPressed: string;
  /** Text/icons sitting on top of an accent fill. */
  onAccent: string;

  /** COMPLETE. Progress, checks, the done state. */
  success: string;
  onSuccess: string;

  /** EARNED. XP and score only. Never a button. */
  gold: string;

  danger: string;

  /** Scrim behind a modal. */
  scrim: string;
}

const DARK: Theme = {
  bg: PALETTE.ink900,
  surface: "rgba(43,37,35,0.92)",
  surfaceRaised: PALETTE.ink600,
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

// The same three accents on warm paper. The app ships a light theme, and it should be the
// SAME product — so the hues do not change, only what they sit on.
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

  // Every pressable thing in light mode is this lavender — settings buttons, the joystick
  // knob, an action button. accentPressed lifts toward the light on press.
  accent: PALETTE.lavenderLight,
  accentPressed: PALETTE.lilac,
  onAccent: PALETTE.linen,

  success: PALETTE.sageDim,
  onSuccess: PALETTE.linen,

  gold: "#a9762f",
  danger: "#a8543f",
  scrim: "rgba(30,25,22,0.45)",
};

// Not a third aesthetic — the same layout with the contrast turned up. Accents keep their
// HUE (so the meanings still hold) but go bright enough to pass against black.
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

/** The interactive lavender, light mode. Exported for the joystick, which lives outside the
 *  themed component tree and can't read useTheme. */
export const ACCENT_LIGHT = PALETTE.lavenderLight;

export const THEMES: Record<ThemeId, Theme> = {
  light: LIGHT,
  dark: DARK,
  high_contrast: HIGH_CONTRAST,
};

/** The active theme. The store already owns the ThemeId; this maps it to tokens. */
export function useTheme(): Theme {
  return THEMES[useGameStore((s) => s.theme)];
}

/** Theme-driven styles, in one line per component:
 *
 *    const makeStyles = (t: Theme) => StyleSheet.create({ … })   // outside the component
 *    const styles = useStyles(makeStyles);                       // inside it
 *
 *  React Native has no cascade — no CSS variables, nothing inherits — so every StyleSheet
 *  has to reach for the tokens itself. This is the whole ceremony required to do that, and
 *  it memoises, so the sheet is rebuilt only when the theme actually changes. */
export function useStyles<T extends object>(make: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => make(theme), [make, theme]);
}

// ── shape ───────────────────────────────────────────────────────────────────
// Three radii, not five. The mockup uses a soft, generous curve everywhere and never
// mixes: a control is 14, a panel is 20, a pill is a pill.
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

/** Every button and panel in the mockup has a hairline border and a soft, wide shadow —
 *  that pairing is what makes surfaces read as LIFTED rather than as flat rectangles of a
 *  different colour. Keep them together. */
export const ELEVATION = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  /** The primary action, and only the primary action. */
  raised: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const;

/** Sizes are deliberately generous: this is a landscape game played with thumbs, and every
 *  control has to clear the 44dp touch minimum WITH its label. */
export const SIZE = {
  controlHeight: 44,
  controlHeightSm: 36,
  fab: 60,
  icon: 20,
} as const;

export const TYPE: Record<
  "label" | "labelSm" | "body" | "title" | "numeric",
  TextStyle
> = {
  label: { fontSize: 14, fontWeight: "700" },
  labelSm: { fontSize: 12, fontWeight: "700" },
  body: { fontSize: 14, fontWeight: "500" },
  title: { fontSize: 18, fontWeight: "800" },
  /** Numbers that CHANGE (XP, counts). Tabular figures, so the layout doesn't jitter as
   *  the score ticks up — the one typographic detail worth spending here. */
  numeric: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
};