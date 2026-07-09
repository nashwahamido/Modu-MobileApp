// Lighting rig for the assembly scene — tuned toward a stylised-PBR look:
// warm key, strong cool rim for bright silhouette edges, gentle fill, and a
// low image-based ambient so the form reads with contrast and drama (vs. the
// old flat, evenly-lit setup). All values physical (lux / Kelvin); tune freely.

// Fallback colour behind the (transparent) Filament view before the bg paints.
export const SCENE_BACKGROUND = '#a8cfe0';

/**
 * Ambient/reflection from the image-based light. Kept LOW on purpose — high IBL
 * flattens everything; lowering it lets the key/rim sculpt the parts. Raise
 * toward ~30000 if the shadow side goes too dark.
 */
export const IBL_INTENSITY = 20_000;

/** KEY — warm, from upper-front-left, casts shadows. The main sculpting light. */
export const KEY_LIGHT = {
  colorKelvin: 4_800,
  intensity: 90_000,
  direction: [-0.5, -1, -0.6] as [number, number, number],
};

/** FILL — cool, opposite side, no shadows; just opens the dark side a little. */
export const FILL_LIGHT = {
  colorKelvin: 7_600,
  intensity: 15_000,
  direction: [0.6, -0.45, 0.5] as [number, number, number],
};

/**
 * RIM — strong cool back-light that carves the bright edge you see in the
 * reference robots and lifts the part off the backdrop. This is what gives the
 * "edge glow" — raise intensity for a hotter rim, lower for subtler.
 */
export const RIM_LIGHT = {
  colorKelvin: 7_800,
  intensity: 64_000,
  direction: [0.3, -0.25, 0.85] as [number, number, number],
};

// ── Selectable lighting rigs ────────────────────────────────────────────────
// The rig above is the "studio" preset. Below are alternative rigs so the table
// can be lit to match each style's mood — warmer/softer light "blends" the part
// into the warm cozy backdrops instead of floating in a cool studio.
import { FurnitureStyle, LightingChoice } from "@/src/adhd/core/type";

type Dir = [number, number, number];
const DIR_KEY: Dir = [-0.5, -1, -0.6];
const DIR_FILL: Dir = [0.6, -0.45, 0.5];
const DIR_RIM: Dir = [0.3, -0.25, 0.85];

export interface LightRig {
  key: { colorKelvin: number; intensity: number; direction: Dir };
  fill: { colorKelvin: number; intensity: number; direction: Dir };
  rim: { colorKelvin: number; intensity: number; direction: Dir };
}

type Preset = "studio" | "warm" | "soft" | "golden";

// IMPORTANT: the image-based ambient (IBL_INTENSITY) is deliberately FIXED and
// is NOT part of these rigs. react-native-filament's EnvironmentalLight releases
// its buffer right after the first use, so changing its intensity at runtime
// throws "FilamentBuffer already released". All mood variation therefore lives
// in the three directional lights; ambient is constant. (Soft, which would have
// wanted more ambient, compensates with a stronger fill; golden, which wanted
// less, leans on a stronger key.)
const PRESETS: Record<Preset, LightRig> = {
  // Current look: cool, dramatic, strong cool rim.
  studio: {
    key: { colorKelvin: 4_800, intensity: 90_000, direction: DIR_KEY },
    fill: { colorKelvin: 7_600, intensity: 15_000, direction: DIR_FILL },
    rim: { colorKelvin: 7_800, intensity: 64_000, direction: DIR_RIM },
  },
  // Warm indoor daylight — warm key + warm fill, gentler warmer rim. Natural.
  warm: {
    key: { colorKelvin: 3_500, intensity: 76_000, direction: DIR_KEY },
    fill: { colorKelvin: 3_200, intensity: 26_000, direction: DIR_FILL },
    rim: { colorKelvin: 4_600, intensity: 36_000, direction: DIR_RIM },
  },
  // Soft & even — low-contrast key, strong fill, minimal rim. Calm, flat, matte.
  soft: {
    key: { colorKelvin: 4_200, intensity: 40_000, direction: DIR_KEY },
    fill: { colorKelvin: 4_000, intensity: 46_000, direction: DIR_FILL },
    rim: { colorKelvin: 5_200, intensity: 18_000, direction: DIR_RIM },
  },
  // Golden hour — strong warm directional key, warm rim. Cozy sunset.
  golden: {
    key: { colorKelvin: 2_950, intensity: 98_000, direction: DIR_KEY },
    fill: { colorKelvin: 3_300, intensity: 16_000, direction: DIR_FILL },
    rim: { colorKelvin: 4_100, intensity: 46_000, direction: DIR_RIM },
  },
};

/** Each style's natural rig when the lighting choice is "auto". */
const STYLE_DEFAULT: Record<FurnitureStyle, Preset> = {
  realistic: "studio",
  cozy: "warm",
  cartoonish: "soft",
};

/**
 * Resolve the active rig from style + dark mode + the (test) lighting choice.
 * Dark mode dims the key/fill for the moody backdrops but keeps the rim
 * relatively strong so the table still separates from the dark background.
 * (Ambient/IBL is fixed — see note above — so it is not scaled here.)
 */
export function getLightRig(
  style: FurnitureStyle,
  darkMode: boolean,
  choice: LightingChoice,
): LightRig {
  const preset: Preset = choice === "auto" ? STYLE_DEFAULT[style] ?? "studio" : choice;
  const p = PRESETS[preset];
  if (!darkMode) return p;
  const s = 0.6;
  return {
    key: { ...p.key, intensity: Math.round(p.key.intensity * s) },
    fill: { ...p.fill, intensity: Math.round(p.fill.intensity * s) },
    rim: { ...p.rim, intensity: Math.round(p.rim.intensity * 0.8) },
  };
}