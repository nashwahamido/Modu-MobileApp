// Time-of-day lighting presets for the room: one authored sun per hour of the day, chosen by the player in settings.
//
// Why presets and not a solar model. A real sun swings a full 360 degrees of azimuth, and for most of that arc it enters the room through the two walls the camera is standing OUTSIDE of — walls that camera-facing culling has faded away. The light pools still land, but they fall out of windows the player cannot see, which reads as light from nowhere rather than as morning. So every preset here keeps the sun inside the one quadrant that streams through the two walls the resting camera can actually see: travelling +x (in through x-min) and -z (in through z-max). See the derivation on the key light in RoomScene.
//
// What varies instead is ELEVATION, COLOUR and STRENGTH — which is what actually reads as time of day. A low sun throws a long raking pool across the floor; a high one drops a short bright patch at the sill. Swinging within the quadrant gives the pool a different angle at each hour without ever sourcing it from a wall that is not there.
//
// Pure data and pure functions: no Filament, no React. The renderer maps a preset onto its lights, and the tests pin the invariants.
import type { Vec3 } from "./roomShell";
import type { RoomBackdropId } from "../ui/roomBackdrops";

export type TimeOfDayId = "morning" | "midday" | "afternoon" | "sunset" | "night";

export const TIME_OF_DAY_IDS: readonly TimeOfDayId[] = ["morning", "midday", "afternoon", "sunset", "night"];

// The room's built-in ceiling light AT ONE HOUR. Every preset carries a full spec, the daylight ones included: the switch stays live at every hour, so morning needs a brightness for the case where a player turns it on.
export type CeilingLight = {
  /** On by default at this hour — true once it is dark outside. The player's switch overrides it for as long as they stay on this hour; see ceilingLightOn. */
  defaultOn: boolean;
  /** Luminous power. CALIBRATED BY EYE against THIS preset's own sun and ambient — Filament scales a light by camera exposure and react-native-filament does not bridge setExposure, so no physically derived number predicts anything here. Tune on device; do not "correct" these toward real bulb ratings. */
  lumens: number;
  /** Bulb colour. Warm after dark; cooler in daylight, where a 2800 K light reads as a yellow stain rather than as a light. */
  kelvin: number;
};

// The cool directional that keeps forms separated from the warm light inside the room. AUTHORED PER HOUR for exactly the reason interiorLight is: this light burns at every hour, so one figure that reads as a clean daylight fill reads as a blue wash after dark, when the sun is at zero and there is nothing else cool in the scene for it to sit against. It was a pair of hard-coded literals in the renderer until 2026-08-18, which is how a 4000 lux 6800 K light ended up as the coldest thing in a room lit by a 2800 K bulb — and why the complaint that surfaced it was "the ceiling light is too cold", a bug no edit to the ceiling light could have fixed.
export type CounterFill = {
  /** Strength in lux. NEVER ZERO — see the note on night's preset below. */
  intensity: number;
  /** Colour temperature. Must stay ABOVE the same hour's interiorLight.kelvin: it stops being a COUNTER-fill the moment it is warmer than the light it counters. */
  kelvin: number;
};

// The flat layer of light whose ONLY job is to keep the WALLS readable. It is not a second sun and not a mood light: with a ceiling overhead the sun can only enter through a window, so every wall outside a shaft is lit by the probe alone — and the probe is deliberately starved after dark (see night's `ambient`) precisely so that placed lights do the lighting. That left the walls themselves with nothing, at the two hours where they are most of the picture: full sun (the eye adapts to the bright floor pool and the walls read as near-black beside it) and night. Raising `ambient` is the wrong lever for it — that lifts EVERYTHING, floor and furniture included, which is the "night still read as daylight" failure the scale warning above records. This lifts the vertical surfaces almost alone, because of HOW it is rigged rather than how strong it is: see WALL_FILL_DIRECTIONS.
export type WallFill = {
  /** Strength in lux, PER DIRECTIONAL — the rig burns two of them, so a wall facing either one receives roughly this much, never double (no wall faces both). May be zero for an hour that genuinely does not want it. */
  intensity: number;
  /** Colour temperature. Free to follow the hour's mood: unlike the counter-fill this light is not countering anything, it is filling in what the sun cannot reach. */
  kelvin: number;
};

// The two directions the wall fill burns from, shared by every hour — the values are the rig, the per-hour WallFill is only its volume.
//
// WHY A PAIR, AND WHY DIAGONAL. A directional lights a surface only when it travels AGAINST that surface's normal. The four wall inner faces point +x, -x, +z, -z, so one directional can ever reach at most two of them, and a room lit by one has two bright walls and two black ones. These two are exact opposites on the diagonal: the first travels +x/+z and so lands on x-max and z-max, the second travels -x/-z and lands on x-min and z-min. Every wall is lit by exactly one of them — which is what makes them EVEN, and why the intensity above is per-light rather than a total.
//
// WHY NEARLY HORIZONTAL. The y term is the whole reason this can be strong enough to matter without flattening the room. Lambert scales by the cosine, so at y = -0.12 a wall (facing the light square-on) receives ~0.7 of the light while the FLOOR receives ~0.12 from each, ~0.24 from the pair — about a third of what the walls take. Tilt these down toward -1 and the fill becomes a second ambient that washes out the sun's pool, which is the one thing on the floor worth protecting. It is not zero on purpose: a fill that is perfectly horizontal grazes the wall bottoms and leaves a dark seam where wall meets floor.
export const WALL_FILL_DIRECTIONS: readonly [number, number, number][] = [
  [0.7, -0.12, 0.7],
  [-0.7, -0.12, -0.7],
];

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
  /** The cool directional fill at this hour. Tracks the hour for the same reason interiorLight does — see CounterFill. */
  counterFill: CounterFill;
  /** The wall-readability layer at this hour — see WallFill. Per-hour like everything else here, because how dark the walls read depends entirely on what the eye is adapted to: a bright floor pool at midday makes them look blacker than the same walls at morning. */
  wallFill: WallFill;
};

// Every direction below has x > 0 and z < 0 — the quadrant that enters through x-min and z-max. Breaking that is what produces pools with no visible window; the test asserts it.
export const TIME_OF_DAY: Record<TimeOfDayId, SunPreset> = {
  // Low and raking from the x-min side, cool and clean. The long pool is the point.
  morning: {
    label: "Morning",
    backdrop: "morning",
    direction: { x: 0.95, y: -0.62, z: -0.28 },
    intensity: 105_000,
    kelvin: 4_500,
    ambient: 6_000,
    interiorLight: { defaultOn: false, lumens: 155_000, kelvin: 3_000 },
    counterFill: { intensity: 4_000, kelvin: 6_800 },
    // Cool-neutral rather than tinted: at the daylight hours the walls' own cream is the colour that should read, and a warm fill on top of it turns them yellow.
    wallFill: { intensity: 9_000, kelvin: 5_200 },
  },
  // High and near-vertical: a short bright patch under each window and the flattest shadows of the day.
  midday: {
    label: "Midday",
    backdrop: "midday",
    direction: { x: 0.34, y: -1.55, z: -0.36 },
    intensity: 135_000,
    kelvin: 6_500,
    ambient: 7_500,
    interiorLight: { defaultOn: false, lumens: 200_000, kelvin: 3_200 },
    counterFill: { intensity: 4_000, kelvin: 6_800 },
    // The most fill of any hour, and that is not a contradiction: midday's 135k sun is what the eye adapts to, so the walls it never reaches read darker here than at any other daylight hour.
    wallFill: { intensity: 12_000, kelvin: 6_000 },
  },
  // The reference look: dropping, golden, pools stretched across the floor.
  afternoon: {
    label: "Afternoon",
    backdrop: "afternoon",
    direction: { x: 0.55, y: -0.78, z: -0.72 },
    intensity: 120_000,
    kelvin: 4_500,
    ambient: 4_500,
    interiorLight: { defaultOn: false, lumens: 165_000, kelvin: 2_900 },
    counterFill: { intensity: 3_000, kelvin: 6_500 },
    wallFill: { intensity: 8_000, kelvin: 5_000 },
  },
  // Nearly horizontal and deep orange. Dim enough that a lamp would start to matter.
  sunset: {
    label: "Sunset",
    backdrop: "sunset",
    direction: { x: 0.3, y: -0.42, z: -0.92 },
    // Raised from 40k on 2026-08-18. A nearly-horizontal sun throws a 6.7 m pool — longer than the room — so this is the hour where sun intensity buys the most drama per lux, and 40k was drawing that long rake too faintly to read as a sunset. It stays clearly the dimmest daylight hour (afternoon is 120k) because "dim enough that a lamp would start to matter" is the preset's whole identity; raise it much past this and sunset becomes a second afternoon with an orange filter.
    intensity: 70_000,
    kelvin: 2_500,
    // Cut from 1500 when the ceiling light arrived. That figure was set while sunset had nothing but the probe to light it after the sun dropped; sunset now defaults a 120k ceiling light ON, so keeping the old fill on top of it lit the room twice and washed out the very contrast the low sun is here to draw. Same rule as night's, read backwards: a light is placed now, so the probe can go back to doing only a probe's job.
    ambient: 400,
    interiorLight: { defaultOn: true, lumens: 190_000, kelvin: 2_500 },
    // Backed well off the daylight figure: the low sun is already warm, and a 4000 lux cool fill on top of it was cancelling exactly the golden cast sunset exists to produce.
    counterFill: { intensity: 800, kelvin: 5_000 },
    // Warm and modest. Sunset's identity is the long orange rake against dimming walls, so this only has to stop those walls crushing to black — push it and the rake has nothing left to be brighter than.
    wallFill: { intensity: 2_200, kelvin: 3_200 },
  },
  // No sun at all. The ambient floor is deliberately generous rather than realistic: this is the screen a player arranges furniture on, and it has to stay workable. Lamps are what should make it inviting, not legible.
  night: {
    label: "Night",
    backdrop: "night",
    direction: null,
    intensity: 0,
    kelvin: 4_000,
    // 900 still read as daylight, because this probe is ~4.4x more potent per unit than the stock one (see the scale warning on `ambient`) — 900 here is roughly 4000 in stock terms. At 200 the probe does only what a probe should after dark: keep surfaces from crushing to pure black, while the LIGHTING placed in the room is what actually lights it. Do not raise this to fix "too dark"; place a light.
    ambient: 200,
    // 2400 K is warm-incandescent, close to candlelight, and deliberately warmer than a real ceiling fitting would be — night is the hour this light exists for, and the counter-fill above is what stops it reading as a flat orange wash. The lumens rose WITH the warming rather than after it: amber reads as dimmer than neutral white at equal output, so warming a bulb without paying for it in lumens makes a room that was already reported too dark darker still.
    interiorLight: { defaultOn: true, lumens: 170_000, kelvin: 2_400 },
    // NOT ZERO, and do not make it zero. This is the hour the constant 4000 lux fill did its real damage — with the sun at 0 and ambient at 200 it was the brightest and coldest thing in the room — but the fix is to back it off, not to remove it: a faint cool rim is what gives the warm bulb something to read against, and a flat-warm room is the same failure as a flat-cold one in a different hue.
    counterFill: { intensity: 300, kelvin: 4_500 },
    // The hour this rig was asked for, alongside full sun. It is the answer the note on `ambient` above demands — "do not raise the probe to fix too dark, place a light" — and this IS the placed light, aimed so it lands on the walls rather than lifting the whole room back to daylight. Warm, to sit with the 2400 K bulb rather than against it; that is the counter-fill's job, not this one's.
    wallFill: { intensity: 1_400, kelvin: 2_900 },
  },
};

export function sunPreset(id: TimeOfDayId): SunPreset {
  return TIME_OF_DAY[id] ?? TIME_OF_DAY.afternoon;
}

// Which of a Room Background's three shots (day/sunset/night) an hour calls for. Morning, midday and
// afternoon all read as "day" outside the window — only sunset and night get their own photo — so
// this collapses TIME_OF_DAY_IDS' five hours down to the three a background actually ships.
export function timeOfDayPhase(id: TimeOfDayId): "day" | "sunset" | "night" {
  if (id === "sunset" || id === "night") return id;
  return "day";
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

// Whether the ceiling light is lit right now. NOT PERSISTED ANYWHERE, and that is the design: because the default comes from the hour, and the hour is the VIEWER's own setting, a room lights itself correctly for whoever is looking at it — including a visitor, who brings their own. There is no owned state for two clients to disagree about. An override is scoped to the hour it was made at: pick a different hour and that hour's default takes over again, because a player who turned the light off at night did not thereby make a decision about midday.
export function ceilingLightOn(hour: TimeOfDayId, override: CeilingLightOverride): boolean {
  return override?.hour === hour ? override.on : sunPreset(hour).interiorLight.defaultOn;
}
