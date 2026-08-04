// Time-of-day lighting presets for the room: one authored sun per hour of the day, chosen by the player in settings.
//
// Why presets and not a solar model. A real sun swings a full 360 degrees of azimuth, and for most of that arc it enters the room through the two walls the camera is standing OUTSIDE of — walls that camera-facing culling has faded away. The light pools still land, but they fall out of windows the player cannot see, which reads as light from nowhere rather than as morning. So every preset here keeps the sun inside the one quadrant that streams through the two walls the resting camera can actually see: travelling +x (in through x-min) and -z (in through z-max). See the derivation on the key light in RoomScene.
//
// What varies instead is ELEVATION, COLOUR and STRENGTH — which is what actually reads as time of day. A low sun throws a long raking pool across the floor; a high one drops a short bright patch at the sill. Swinging within the quadrant gives the pool a different angle at each hour without ever sourcing it from a wall that is not there.
//
// Pure data and pure functions: no Filament, no React. The renderer maps a preset onto its lights, and the tests pin the invariants.
import type { Vec3 } from "./roomShell";
import type { RoomBackdropId } from "../ui/roomBackdrops";

export type TimeOfDayId = "morning" | "midday" | "afternoon" | "evening" | "night";

export const TIME_OF_DAY_IDS: readonly TimeOfDayId[] = ["morning", "midday", "afternoon", "evening", "night"];

// The room's built-in ceiling light AT ONE HOUR. Every preset carries a full spec, the daylight ones included: the switch stays live at every hour, so morning needs a brightness for the case where a player turns it on.
export type CeilingLight = {
  /** On by default at this hour — true once it is dark outside. The player's switch overrides it for as long as they stay on this hour; see ceilingLightOn. */
  defaultOn: boolean;
  /** Luminous power. CALIBRATED BY EYE against THIS preset's own sun and ambient — Filament scales a light by camera exposure and react-native-filament does not bridge setExposure, so no physically derived number predicts anything here. Tune on device; do not "correct" these toward real bulb ratings. */
  lumens: number;
  /** Bulb colour. Warm after dark; cooler in daylight, where a 2800 K light reads as a yellow stain rather than as a light. */
  kelvin: number;
};

/** The player's deviation from an hour's default, STAMPED WITH THE HOUR IT WAS MADE AT. The stamp is what makes "forget it when the hour changes" a derivation instead of an effect — a stale override is simply never read. Null means they have not touched the switch. */
export type CeilingLightOverride = { hour: TimeOfDayId; on: boolean } | null;

export type SunPreset = {
  label: string;
  /** Travel direction of the key light. Null at night: there is no sun, and the room is carried by ambient and (later) lamps. */
  direction: Vec3 | null;
  /** Key light strength in lux. */
  intensity: number;
  /** Key light colour temperature. Low = warm. */
  kelvin: number;
  /** The view out of the room at this hour. One switch drives both, because a daytime photo behind a night-lit room reads as a bug, and nothing about the pair is worth choosing independently. */
  backdrop: RoomBackdropId;
  /** Ambient probe strength. The stand-in for bounce light, so it can never reach zero or an unwindowed room goes black.
   * SCALE WARNING: room_ibl.ktx has sh[0] ~3.5 against the stock probe's ~0.79, so it is about 4.4x more potent per unit. A number that looks small here is not. This is why night at 900 still read as daylight. */
  ambient: number;
  /** The room's own ceiling light at this hour. Authored per preset rather than shared, so night can be a low warm glow while midday is bright enough to be visible against a 135,000 lux sun. */
  interiorLight: CeilingLight;
};

// Every direction below has x > 0 and z < 0 — the quadrant that enters through x-min and z-max. Breaking that is what produces pools with no visible window; the test asserts it.
export const TIME_OF_DAY: Record<TimeOfDayId, SunPreset> = {
  // Low and raking from the x-min side, cool and clean. The long pool is the point.
  morning: {
    label: "Morning",
    backdrop: "day",
    direction: { x: 0.95, y: -0.62, z: -0.28 },
    intensity: 105_000,
    kelvin: 5_400,
    ambient: 6_000,
    interiorLight: { defaultOn: false, lumens: 70_000, kelvin: 3_400 },
  },
  // High and near-vertical: a short bright patch under each window and the flattest shadows of the day.
  midday: {
    label: "Midday",
    backdrop: "day",
    direction: { x: 0.34, y: -1.55, z: -0.36 },
    intensity: 135_000,
    kelvin: 5_900,
    ambient: 7_500,
    interiorLight: { defaultOn: false, lumens: 90_000, kelvin: 3_600 },
  },
  // The reference look: dropping, golden, pools stretched across the floor.
  afternoon: {
    label: "Afternoon",
    backdrop: "day",
    direction: { x: 0.55, y: -0.78, z: -0.72 },
    intensity: 120_000,
    kelvin: 4_100,
    ambient: 5_500,
    interiorLight: { defaultOn: false, lumens: 75_000, kelvin: 3_200 },
  },
  // Nearly horizontal and deep orange. Dim enough that a lamp would start to matter.
  evening: {
    label: "Evening",
    backdrop: "night",
    direction: { x: 0.3, y: -0.42, z: -0.92 },
    intensity: 62_000,
    kelvin: 2_900,
    ambient: 1_500,
    interiorLight: { defaultOn: true, lumens: 55_000, kelvin: 2_900 },
  },
  // No sun at all. The ambient floor is deliberately generous rather than realistic: this is the screen a player arranges furniture on, and it has to stay workable. Lamps are what should make it inviting, not legible.
  night: {
    label: "Night",
    backdrop: "night",
    direction: null,
    intensity: 0,
    kelvin: 4_000,
    // 900 still read as daylight, because this probe is ~4.4x more potent per unit than the stock one
    // (see the scale warning on `ambient`) — 900 here is roughly 4000 in stock terms. At 200 the probe
    // does only what a probe should after dark: keep surfaces from crushing to pure black, while the
    // LIGHTING placed in the room is what actually lights it. Do not raise this to fix "too dark"; place a light.
    ambient: 200,
    interiorLight: { defaultOn: true, lumens: 45_000, kelvin: 2_800 },
  },
};

export function sunPreset(id: TimeOfDayId): SunPreset {
  return TIME_OF_DAY[id] ?? TIME_OF_DAY.afternoon;
}

// The renderer wants a plain tuple, and a null direction still needs one — Filament has no "no direction" — so night points straight down at zero intensity, which contributes nothing.
export function sunDirection(preset: SunPreset): [number, number, number] {
  const d = preset.direction ?? { x: 0, y: -1, z: 0 };
  return [d.x, d.y, d.z];
}

// How far a wall of this height throws its pool across the floor, in metres. Purely diagnostic — it is the number that made the original low sun unusable (2.3 m across a 4.5 m room) and the one to check when authoring a new preset.
export function poolLength(preset: SunPreset, wallHeight = 2.92): number {
  const d = preset.direction;
  if (!d) return 0;
  return (wallHeight * Math.hypot(d.x, d.z)) / Math.abs(d.y);
}

// Whether the ceiling light is lit right now. NOT PERSISTED ANYWHERE, and that is the design: because the default comes from the hour, and the hour is the VIEWER's own setting, a room lights itself correctly for whoever is looking at it — including a visitor, who brings their own. There is no owned state for two clients to disagree about.
// An override is scoped to the hour it was made at: pick a different hour and that hour's default takes over again, because a player who turned the light off at night did not thereby make a decision about midday.
export function ceilingLightOn(hour: TimeOfDayId, override: CeilingLightOverride): boolean {
  return override?.hour === hour ? override.on : sunPreset(hour).interiorLight.defaultOn;
}
