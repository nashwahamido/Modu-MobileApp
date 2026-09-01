import { LightingPreset } from "@/src/game/core/accessibility";
import { RenderStyleId } from "@/src/game/core/type";

export const SCENE_BACKGROUND = "#f0e9dd";

export const IBL_INTENSITY = 30_000;

export const CEL_IBL_INTENSITY = 9_000;

type Dir = [number, number, number];
export const DIR_KEY: Dir = [-0.5, -1, -0.6];
const DIR_FILL: Dir = [0.6, -0.45, 0.5];
const DIR_RIM: Dir = [0.3, -0.25, 0.85];

export interface LightRig {
  key: { colorKelvin: number; intensity: number; direction: Dir };
  fill: { colorKelvin: number; intensity: number; direction: Dir };
  rim: { colorKelvin: number; intensity: number; direction: Dir };
}

type Preset = "studio" | "warm" | "soft" | "golden";

const PRESETS: Record<Preset, LightRig> = {
  studio: {
    key: { colorKelvin: 4_800, intensity: 90_000, direction: DIR_KEY },
    fill: { colorKelvin: 7_600, intensity: 15_000, direction: DIR_FILL },
    rim: { colorKelvin: 7_800, intensity: 64_000, direction: DIR_RIM },
  },
  warm: {
    key: { colorKelvin: 3_500, intensity: 76_000, direction: DIR_KEY },
    fill: { colorKelvin: 3_200, intensity: 26_000, direction: DIR_FILL },
    rim: { colorKelvin: 4_600, intensity: 36_000, direction: DIR_RIM },
  },
  soft: {
    key: { colorKelvin: 4_200, intensity: 40_000, direction: DIR_KEY },
    fill: { colorKelvin: 4_000, intensity: 46_000, direction: DIR_FILL },
    rim: { colorKelvin: 5_200, intensity: 18_000, direction: DIR_RIM },
  },
  golden: {
    key: { colorKelvin: 2_950, intensity: 98_000, direction: DIR_KEY },
    fill: { colorKelvin: 3_300, intensity: 16_000, direction: DIR_FILL },
    rim: { colorKelvin: 4_100, intensity: 46_000, direction: DIR_RIM },
  },
};

const STYLE_DEFAULT: Record<RenderStyleId, Preset> = {
  realistic: "studio",
  cozy: "warm",
  cartoon: "soft",
  toon: "soft",
  illustrated: "soft",
};

export function getLightRig(
  style: RenderStyleId,
  darkMode: boolean,
  choice: LightingPreset,
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