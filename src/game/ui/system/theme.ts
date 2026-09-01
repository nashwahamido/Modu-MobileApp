// The design tokens. Every colour, radius, and shadow in the UI comes from here.
//
// ─────────────────────────────────────────────────────────────────────────────
// FRONT-END CONVENTIONS. This file is the canonical home for them, because it is the one file every UI file already imports. Read this before adding a screen or restyling one.
//
// 1. ONE COMMENT = ONE LINE. A comment line is a whole thought; never wrap a sentence onto the next line. Long lines are fine and normal here — the break carries meaning, so a break mid-sentence reads as a new point that isn't one. (This header is the one indented-prose exception.)
//
// 2. STYLES LIVE AT THE BOTTOM OF THE COMPONENT, in `const makeStyles = (t: Theme) => StyleSheet.create({…})`, read with `const s = useStyles(makeStyles)`. Not a sibling `.styles.ts`: that was tried in July and reverted, because Expo Router treats every file under src/app as a ROUTE and the style files became phantom screens. Shared sheets are fine OUTSIDE src/app (see game/ui/hudChrome.tsx for the pattern).
//
// 3. NEVER WRITE A RAW HEX IN A COMPONENT. Two palettes, and which one you want is a real decision:
//    - `t.*` (the `Theme` below, via useTheme/useStyles) for anything that should follow light / dark / high-contrast. Default to this.
//    - `CREAM.*` for the room, shop and inventory chrome, which is deliberately theme-INVARIANT. If a colour is genuinely one-off, name it as a `const` at the top of the file so the next person can see it was a choice. Seven copies of the same ink hex is how the last drift started.
//
// 4. SHADOWS COME FROM A SCALE TOO: `CREAM_LIFT.*` on cream surfaces, `ELEVATION.*` on the dark HUD. They are not interchangeable — a black HUD shadow reads as grime on cream.
//
// 5. TEXT ALWAYS CARRIES THE FAMILY. Use `TYPE.*` or spread `LEXEND.*`; React Native has no font inheritance, so a style that sets `fontWeight` without `fontFamily` silently renders in the system font. That mismatch is subtle on device and is the usual cause of "why does this look off".
//
// 6. DELIBERATE TWINS STAY IN STEP THROUGH SHARED PIECES, NOT COPIES. ShopOverlay/InventoryOverlay (and their tabs and tiles) are separate components on purpose, so anything that must LOOK the same is a shared token or a shared helper — never a number pasted into both. If you find yourself copying a value between twins, that value wants a name in here instead.
// ─────────────────────────────────────────────────────────────────────────────
//
// The palette is SAMPLED from the reference mockup, not eyeballed — the hexes below are the medians of the actual pixel clusters in it.
//
// The character of it, so it doesn't get lost in a later edit:
//
//   The near-black is WARM. #1b1819, not #181818 — brown-shifted, so it sits in the same family as the pine and the workbench rather than reading as generic dark mode. Every surface above it keeps that same warm shift.
//
//   The accent is a MUTED, dusty lavender. Desaturated on purpose: a saturated purple would fight the wood, and the wood is the thing the player is looking at. The UI's job is to stay quiet around it.
//
//   Three accents, three meanings, no overlap. Lavender = interactive (press this).
//   Green = complete (you did this). Gold = earned (XP, score). If a fourth meaning shows up, it does NOT get a fourth colour — it gets a shape or a position.

import { Dimensions, StyleSheet, useWindowDimensions } from "react-native";
import { createContext, useContext, useMemo } from "react";
import type { TextStyle } from "react-native";
import { ThemeId } from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";

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
  // LIGHTER than the old rgba(43,37,35,0.92) — at near-black these chips read as holes punched in
  // the build — and effectively SOLID: what makes them work is the raised grey value, not seeing the
  // workbench through them. The last 1% of alpha keeps the edge from looking cut out of the scene.
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

// The same three accents on warm paper. The app ships a light theme, and it should be the SAME product — so the hues do not change, only what they sit on.
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

  // Every pressable thing in light mode is this lavender — settings buttons, the joystick knob, an action button. accentPressed lifts toward the light on press.
  accent: PALETTE.lavenderLight,
  accentPressed: PALETTE.lilac,
  onAccent: PALETTE.linen,

  success: PALETTE.sageDim,
  onSuccess: PALETTE.linen,

  gold: "#a9762f",
  danger: "#a8543f",
  scrim: "rgba(30,25,22,0.45)",
};

// Not a third aesthetic — the same layout with the contrast turned up. Accents keep their HUE (so the meanings still hold) but go bright enough to pass against black.
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

// The IN-SCENE control language: the dials, pads and sliders that sit over the 3D build. Drawn like a sticker — every shape filled, then outlined in a darker shade of the same hue. The outline is what gives a control weight against the scene: a flat band alone reads as a thin UI stroke, an outlined one reads as an object. These are theme-INVARIANT like CREAM, and for the same reason: they sit on the wood, not on a themed surface. The fill IS the app's interactive lavender, so a control never disagrees with a button about what "you can press this" looks like. Before this existed the hex was pasted into 17 files, which is how the dial family ended up with four copies of one gauge.
export const CONTROL = {
  fill: PALETTE.lavenderLight,
  /** The ink outline: the same hue, +13pp saturation, −11pp value. */
  ink: "#6A548B",
  /** The part of a gauge still to travel, kept faint. */
  track: "rgba(60,50,40,0.13)",
  /** `fill` at 25%, for the travelled part of a SLIDER track — present but not competing with the thumb. */
  fillSoft: "rgba(141, 123, 168, 0.25)",
} as const;

// The room / shop / inventory redesign's FIXED palette, sampled from the mockup.
// Deliberately theme-INVARIANT: those surfaces hold their look across light, dark and high-contrast. That is a design decision and not an oversight — they are cream-on-cream chrome, and re-tinting them per theme would break the material. It lives here rather than as a const per file because these values MUST agree: the hairline on the room's bottom bar is the same hairline on the shop's tab pill and the inventory's badge. Seven copies of the ink hex alone had already accumulated before this moved here. Anything that should follow the theme belongs in `Theme` above, not in here.
export const CREAM = {
  /** Text and icons on cream. */
  ink: "#231F20",
  /** Secondary text on cream — a subtitle, a row's meta line. `ink` softened rather than a new hue, so
   *  a quiet line still belongs to the same ink. Use this rather than the theme's textDim: these
   *  surfaces are theme-INVARIANT, and textDim follows the theme — in dark mode it resolves to a stone
   *  grey that lands at about 2.4:1 on this cream. */
  inkDim: "rgba(35,31,32,0.62)",
  /** Panels, cards, popups. */
  card: "#FBFAF3",
  /** Chrome sitting ON a card: the tab pill, the badge disc. */
  chrome: "#F7F0E6",
  /** The active category tile: the one lavender in these surfaces, meaning exactly one thing — where you are. */
  activeTile: "#D3CBD2",
  /** The room navigation's active mark: the disc behind Shop or Inventory while that popup is open.
   *  Sand rather than `activeTile`'s lavender — the room's chrome is warm cream, and the lavender is
   *  already spoken for by the assemble button, which is an action rather than a place. Shared, so the
   *  phone's rail and the tablet's bar cannot drift: they are separate components on purpose, and this
   *  is exactly the kind of thing that must LOOK the same in both. */
  navActive: "#E4D9C9",
  hairline: "#D7D1CE",
  hairlineWidth: 0.4,
  /** The bloom behind a badge icon. */
  badgeGlow: "#FFFCF7",
  /** A filled DARK control on cream — the popups' close button. Its icon/label is `card`. */
  darkChip: "#3D3A38",
} as const;

// The shadows for those same cream surfaces.
// A separate scale from ELEVATION below, on purpose: that one is authored for the dark HUD (#000 at 0.35-0.45), and on cream a black shadow reads as grime rather than as height. These use a warm grey at low opacity instead. Four tiers, and the numbers are EXACTLY what the eight call sites had — this is an extraction, not a retune. KNOWN ODDITY 1: `panel` and `card` have IDENTICAL iOS shadows and differ only in Android `elevation` (6 vs 8). So on Android a purchase popup reads as floating above the shop panel it sits on, and on iOS the two read as the same height. One of those is wrong, and which one depends on the intent, so it is preserved here rather than guessed at. KNOWN ODDITY 2: `chip` uses #000 rather than the warm grey, because the close button it belongs to is itself the only dark thing on the cream.
/** The catalogue card's edge and shadow, so the room's chrome — its bars, its bottom navigation, its
 *  light buttons — reads as the same object as the cards on the build screen.
 *
 *  boxShadow is what actually draws the shadow on ANDROID: `elevation` ignores shadowColor and
 *  shadowOpacity and paints its own grey ramp, which is why colour edits to those properties used to
 *  change nothing on device. The shadowColor/Radius/Offset below are the iOS + old-architecture
 *  fallback, and `elevation` only keeps Android's z-ordering honest. */
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
  /** The popup frame: shop and inventory panels. */
  panel: {
    shadowColor: "#929292",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /** A card floating ON a panel: the purchase notice and confirm. */
  card: {
    shadowColor: "#929292",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  /** Barely there, so a button lifts off its card without reading as a raised chip. */
  control: {
    shadowColor: "#929292",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** The dark close button. */
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

/** The active theme. The store already owns the ThemeId; this maps it to tokens. */
/**
 * A theme forced on ONE subtree, regardless of the app's own.
 *
 * "Assemble in dark mode" is a property of the build screen, not of the app: the room, catalogue and
 * shop stay light while the workbench goes dark. A context does that without a second palette —
 * everything under the provider resolves through the same tokens, it just resolves a different one.
 * null (the default) means "use the app theme", which is what every other screen gets.
 */
const ThemeOverride = createContext<ThemeId | null>(null);

/** Wrap a subtree to pin its theme. Used by the assembly screens; nothing else should need it. */
export const ThemeScope = ThemeOverride.Provider;

/** The ThemeId in effect here — the scope's, if one is set, else the app's. */
export function useThemeId(): ThemeId {
  const scoped = useContext(ThemeOverride);
  const app = usePrefsStore((s) => s.theme);
  return scoped ?? app;
}

export function useTheme(): Theme {
  return THEMES[useThemeId()];
}

/** Theme-driven styles, in one line per component:
 *
 *    const makeStyles = (t: Theme) => StyleSheet.create({ … })   // outside the component
 *    const styles = useStyles(makeStyles);                       // inside it
 *
 *  React Native has no cascade — no CSS variables, nothing inherits — so every StyleSheet
 *  has to reach for the tokens itself. This is the whole ceremony required to do that, and
 *  it memoises, so the sheet is rebuilt only when the theme actually changes. */
/**
 * THE RESPONSIVE LAYER.
 *
 * These layouts are authored in points against a phone in landscape — about 360dp on the short side.
 * A tablet's short side is roughly 800dp, so the same numbers occupy less than half the relative
 * space and every panel, label and control reads as shrunken and adrift on a large screen.
 *
 * The scale is applied HERE rather than screen by screen because the app has ~200 raw font sizes
 * across ~54 sheets: a token-based fix would miss most of them, and editing 54 files by hand is a
 * large diff with a small chance of being uniformly right. Every one of those sheets already goes
 * through useStyles, so one place covers all of them at once.
 *
 * On a phone the scale is exactly 1 and scaleSheet returns the sheet untouched — this cannot change
 * how the app looks on the device it was designed against.
 */
export function useStyles<T extends object>(make: (theme: Theme) => T): T {
  const theme = useTheme();
  const k = useUiScale();
  return useMemo(() => scaleSheet(make(theme), k), [make, theme, k]);
}

/**
 * Theme-driven styles at a scale the CALLER chooses, rather than the app-wide one.
 *
 * For a surface that needs to grow on a tablet but not by the shared amount — the room's HUD frames a
 * scene rather than filling the screen, so it takes a trimmed scale of its own. Pass 1 and this is
 * useFixedStyles; pass useUiScale() and it is useStyles.
 *
 * IT MUST BE THE SAME NUMBER the caller uses for anything it scales by hand. A sheet on one scale and
 * inline offsets on another is not a smaller version of the layout, it is a broken one: the parts that
 * happen to live in the sheet grow while the parts multiplied at the call site shrink.
 */
export function useScaledStyles<T extends object>(make: (theme: Theme) => T, k: number): T {
  const theme = useTheme();
  return useMemo(() => scaleSheet(make(theme), k), [make, theme, k]);
}

/**
 * Theme-driven styles with NO device scaling. The opt-OUT, chosen PER SCREEN.
 *
 * Scaling is not a global property of the app — it is a decision about one screen. These surfaces
 * are laid out to the point and their controls have no slack: the room, the catalogue, the assembly
 * HUD, the project map, the completion screen, the shop and the inventory. Growing a 13pt label
 * inside a fixed 36pt chip puts labels through their borders and icons over each other long before
 * it makes anything more readable, so they are left exactly as authored on every device.
 *
 * The onboarding flow and the avatar recommendation keep useStyles and do scale: big panels,
 * generous padding, one thing on screen at a time, and room to grow into.
 */
export function useFixedStyles<T extends object>(make: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => make(theme), [make, theme]);
}

/**
 * How much to enlarge fixed point dimensions on a bigger screen.
 *
 * Bounded by BOTH sides, and the smaller bound wins. The short side is what governs how big
 * something feels in the hand, so it sets the scale we WANT; the long side is what the layouts are
 * actually laid out along, so it sets the scale we can AFFORD. Taking only the short side is what
 * broke the iPad: see below.
 *
 * Capped below the true ratio of ~2.2: type sized for a phone at arm's length does not want to
 * double on a tablet held at the same distance. 1.45 was too timid though — on a 1280dp tablet it
 * left the UI visibly adrift in its own screen — so 1.75, which fills the screen without reading as
 * a magnified phone.
 *
 * WHY THE LONG SIDE IS IN HERE. A 16:10 tablet and a 4:3 tablet with the SAME short side are not the
 * same canvas: an iPad Air 3 (1112x834) has a LARGER short side than a Lenovo Tab M10 (1280x800) and
 * a 168dp SMALLER long side. On the short side alone both capped at 1.75, so the iPad rendered full
 * 1.75x type and padding inside a screen 21% narrower than the layouts assume — the tutorial popup
 * on the avatar screen went 65dp off the left edge, and the questionnaire's option cards collapsed
 * to four characters a line and burst their fixed height. Dividing the long side by the width these
 * layouts were authored against gives the honest ceiling: 1.39 on the Air 3, 1.60 on the M10.
 *
 * Anything laid out at a FIXED width still has to be checked against this — the clamp buys headroom,
 * it does not make a fixed width safe. Prefer proportional widths for anything that spans the screen,
 * and never pair a SCALED width with an UNSCALED absolute offset (see SCALED_PROPS: top/left/right/
 * bottom deliberately do not scale, so `right: 92` next to `width: 620 * k` has nothing holding it
 * on screen).
 */
export function useUiScale(): number {
  const { width, height } = useWindowDimensions();
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  // PHONES ARE LEFT ALONE, exactly. A continuous scale sounded right and was not: a phone whose
  // short side measures 380 rather than the 360 these layouts assume would get k = 1.06, rebuild
  // every sheet, and shift a layout that was already correct — for no benefit at all. The scale only
  // engages on a screen big enough to genuinely need it, and below that the sheet is returned
  // untouched rather than merely multiplied by one.
  if (short < TABLET_MIN_SHORT_DP) return 1;
  // Never below 1: a tablet narrower than the phone canvas would otherwise SHRINK the UI, which is
  // not a case this scale is for. The max() sits inside the min() chain so the long-side ceiling can
  // still pull the result down toward 1, but no further.
  return Math.max(1, Math.min(MAX_UI_SCALE, short / PHONE_SHORT_DP, long / PHONE_LONG_DP));
}

/** The short side these layouts were authored against (phone, landscape). */
const PHONE_SHORT_DP = 360;
/** The long side these layouts were authored against (phone, landscape). The divisor for the
 *  long-side ceiling above: at k = long / PHONE_LONG_DP a screen has exactly the horizontal room the
 *  phone had, which is the most the fixed widths in these sheets can be trusted with. */
const PHONE_LONG_DP = 800;
/**
 * Is this a tablet? The one place that question is answered.
 *
 * Exported because it decides more than scale: the room draws a DIFFERENT layout on each — a rail down
 * the right on a phone, a bar across the bottom on a tablet — and a second copy of this threshold
 * somewhere else would eventually disagree with the scaling about which device it is looking at.
 */
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_MIN_SHORT_DP;
}

/** The same question outside React, for code that decides once rather than re-rendering — the
 *  tutorial builds its step list in an effect and a hook's value cannot be read there without
 *  making device size a reason to rebuild the run. */
export function isTabletScreen(): boolean {
  const { width, height } = Dimensions.get("window");
  return Math.min(width, height) >= TABLET_MIN_SHORT_DP;
}

/** Below this the device is a phone and nothing is scaled. Comfortably above any phone in landscape
 *  (~330-420dp) and comfortably below any tablet (~700dp+), so neither is a borderline case. */
const TABLET_MIN_SHORT_DP = 600;
const MAX_UI_SCALE = 1.75;

/**
 * Properties that describe SIZE, and therefore scale with the screen.
 *
 * Deliberately not everything numeric. borderWidth and elevation stay put — a hairline is a hairline
 * at any size, and a shadow that grew with the screen would read as the whole UI floating higher.
 * flex, opacity and zIndex are ratios and orderings, not measurements. Absolute offsets (top, left,
 * right, bottom) are excluded as well: they are usually safe-area or edge insets, and scaling those
 * pushes content off the screen rather than making it bigger.
 */
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

/** Multiplies the size properties of a finished sheet. Percent strings and non-size values pass
 *  through untouched, so a "48%" width still means half its container at any scale. */
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

// ── shape ───────────────────────────────────────────────────────────────────
// Three radii, not five. The mockup uses a soft, generous curve everywhere and never mixes: a control is 14, a panel is 20, a pill is a pill.
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

// ── type ────────────────────────────────────────────────────────────────────
// ONE family for the whole app. Lexend is installed NATIVELY (app.json -> expo-font plugin), registered on Android as an XML font-family with a real face per weight — so `fontFamily: FONT` plus an ordinary `fontWeight` resolves to the right cut. There is no runtime useFonts() anywhere and no loading gate: the faces exist before the first frame, which is the whole reason this is a build-time install and not a runtime one.
//
// React Native has no font inheritance, so FONT has to appear in every text style. A style that sets fontWeight without FONT silently renders in the system font — that mismatch is the failure mode to watch for, not a missing font.
export const FONT = "Lexend";

// The OpenDyslexic alternative and its `useReadingFont` hook were REMOVED 2026-08-19, along with
// the setting that switched them on and the fonts themselves. Every reading surface — the objective
// line, hints, the tutorial's messages, the questionnaire — takes FONT like everything else now.

/** The named weights, as spreadable style fragments:
 *
 *    label: { ...LEXEND.bold, fontSize: 14 }
 *
 *  Prefer these to writing the pair by hand — family and weight have to travel together. */
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
  /** Numbers that CHANGE (XP, counts). Tabular figures, so the layout doesn't jitter as
   *  the score ticks up — the one typographic detail worth spending here. */
  numeric: { ...LEXEND.bold, fontSize: 13, fontVariant: ["tabular-nums"] },
};