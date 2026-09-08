import type { Vec3 } from "./roomShell";
import type { RoomBackdropId } from "../ui/roomBackdrops";

export type TimeOfDayId = "morning" | "midday" | "afternoon" | "sunset" | "night";

export const TIME_OF_DAY_IDS: readonly TimeOfDayId[] = ["morning", "midday", "afternoon", "sunset", "night"];

export type CeilingLight = {
  defaultOn: boolean;
  lumens: number;
  kelvin: number;
};

export type CounterFill = {
  intensity: number;
  kelvin: number;
};

export type WallFill = {
  intensity: number;
  kelvin: number;
};

export const WALL_FILL_DIRECTIONS: readonly [number, number, number][] = [
  [0.7, -0.12, 0.7],
  [-0.7, -0.12, -0.7],
];

export type CeilingLightOverride = {
  hour: TimeOfDayId;
  on: boolean;
} | null;

export type SunPreset = {
  label: string;
  direction: Vec3 | null;
  intensity: number;
  kelvin: number;
  backdrop: RoomBackdropId;
  ambient: number;
  interiorLight: CeilingLight;
  counterFill: CounterFill;
  wallFill: WallFill;
};

export const TIME_OF_DAY: Record<TimeOfDayId, SunPreset> = {
  morning: {
    label: "Morning",
    backdrop: "morning",
    direction: {
      x: 0.95,
      y: -0.62,
      z: -0.28,
    },
    intensity: 105_000,
    kelvin: 4_500,
    ambient: 6_000,
    interiorLight: {
      defaultOn: false,
      lumens: 155_000,
      kelvin: 3_000,
    },
    counterFill: {
      intensity: 4_000,
      kelvin: 6_800,
    },
    wallFill: {
      intensity: 9_000,
      kelvin: 5_200,
    },
  },
  midday: {
    label: "Midday",
    backdrop: "midday",
    direction: {
      x: 0.34,
      y: -1.55,
      z: -0.36,
    },
    intensity: 135_000,
    kelvin: 6_500,
    ambient: 7_500,
    interiorLight: {
      defaultOn: false,
      lumens: 200_000,
      kelvin: 3_200,
    },
    counterFill: {
      intensity: 4_000,
      kelvin: 6_800,
    },
    wallFill: {
      intensity: 12_000,
      kelvin: 6_000,
    },
  },
  afternoon: {
    label: "Afternoon",
    backdrop: "afternoon",
    direction: {
      x: 0.55,
      y: -0.78,
      z: -0.72,
    },
    intensity: 120_000,
    kelvin: 4_500,
    ambient: 4_500,
    interiorLight: {
      defaultOn: false,
      lumens: 165_000,
      kelvin: 2_900,
    },
    counterFill: {
      intensity: 3_000,
      kelvin: 6_500,
    },
    wallFill: {
      intensity: 8_000,
      kelvin: 5_000,
    },
  },
  sunset: {
    label: "Sunset",
    backdrop: "sunset",
    direction: {
      x: 0.3,
      y: -0.42,
      z: -0.92,
    },
    intensity: 70_000,
    kelvin: 2_500,
    ambient: 400,
    interiorLight: {
      defaultOn: true,
      lumens: 190_000,
      kelvin: 2_500,
    },
    counterFill: {
      intensity: 800,
      kelvin: 5_000,
    },
    wallFill: {
      intensity: 2_200,
      kelvin: 3_200,
    },
  },
  night: {
    label: "Night",
    backdrop: "night",
    direction: null,
    intensity: 0,
    kelvin: 4_000,
    ambient: 200,
    interiorLight: {
      defaultOn: true,
      lumens: 170_000,
      kelvin: 2_400,
    },
    counterFill: {
      intensity: 300,
      kelvin: 4_500,
    },
    wallFill: {
      intensity: 1_400,
      kelvin: 2_900,
    },
  },
};

export function sunPreset(id: TimeOfDayId): SunPreset {
  return TIME_OF_DAY[id] ?? TIME_OF_DAY.afternoon;
}

export function timeOfDayPhase(id: TimeOfDayId): "day" | "sunset" | "night" {
  if (id === "sunset" || id === "night") return id;
  return "day";
}

export function sunDirection(preset: SunPreset): [number, number, number] {
  const d = preset.direction ?? {
    x: 0,
    y: -1,
    z: 0,
  };
  return [d.x, d.y, d.z];
}

export function poolLength(preset: SunPreset, wallHeight = 2.92): number {
  const d = preset.direction;
  if (!d) return 0;
  return (wallHeight * Math.hypot(d.x, d.z)) / Math.abs(d.y);
}

export function ceilingLightOn(hour: TimeOfDayId, override: CeilingLightOverride): boolean {
  return override?.hour === hour ? override.on : sunPreset(hour).interiorLight.defaultOn;
}
