// Time-of-day lighting presets: one authored sun per hour, chosen by the player in settings.
// Presets and not a solar model, because a real sun spends most of its arc entering through the two walls the camera stands OUTSIDE of — the pools still land, but out of windows the player cannot see, which reads as light from nowhere.
// So every preset keeps the sun in the one quadrant that streams through the two visible walls: travelling +x and -z.
// What varies instead is ELEVATION, COLOUR and STRENGTH, which is what reads as time of day — a low sun rakes a long pool across the floor, a high one drops a short patch at the sill.
import type { Vec3 } from "./roomShell";
import type { RoomBackdropId } from "../ui/roomBackdrops";

export type TimeOfDayId = "morning" | "midday" | "afternoon" | "sunset" | "night";

export const TIME_OF_DAY_IDS: readonly TimeOfDayId[] = ["morning", "midday", "afternoon", "sunset", "night"];

// The built-in ceiling light AT ONE HOUR. Every preset carries a full spec, daylight included: the switch stays live at every hour, so morning needs a brightness for when a player turns it on.
export type CeilingLight = {
  // On by default at this hour, true once it is dark outside. The player's switch overrides it for as long as they stay on this hour.
  defaultOn: boolean;
  // Luminous power, CALIBRATED BY EYE against this preset's own sun and ambient: Filament scales by camera exposure and RNF does not bridge setExposure, so no physical number predicts anything here.
  // Tune on device; do not "correct" these toward real bulb ratings.
  lumens: number;
  // Bulb colour: warm after dark, cooler in daylight where 2800K reads as a yellow stain rather than a light.
  kelvin: number;
};

// The cool directional that keeps forms separated from the warm light indoors. PER HOUR for the reason interiorLight is: it burns at every hour, so one figure that reads as a clean daylight fill reads as a blue wash after dark.
// Hard-coded in the renderer, a 4000 lux 6800K light became the coldest thing in a room lit by a 2800K bulb — surfacing as "the ceiling light is too cold", a bug no edit to the ceiling light could fix.
export type CounterFill = {
  // Strength in lux. NEVER ZERO — see night's preset below.
  intensity: number;
  // Must stay ABOVE the same hour's interiorLight.kelvin: it stops being a COUNTER-fill the moment it is warmer than what it counters.
  kelvin: number;
};

// The layer whose ONLY job is keeping the WALLS readable — not a second sun and not a mood light.
// With a ceiling overhead the sun enters only through a window, so a wall outside a shaft is lit by the probe alone, and the probe is starved after dark on purpose so placed lights do the lighting.
// That left the walls with nothing at the two hours they are most of the picture: full sun, where the eye adapts to the floor pool, and night. Raising `ambient` is the wrong lever — it lifts EVERYTHING.
// This lifts the vertical surfaces almost alone because of HOW it is rigged, not how strong it is: see WALL_FILL_DIRECTIONS.
export type WallFill = {
  // Strength in lux, PER DIRECTIONAL: the rig burns two, so a wall facing either receives about this much and never double, since no wall faces both. May be zero.
  intensity: number;
  // Free to follow the hour's mood: unlike the counter-fill this counters nothing, it fills in what the sun cannot reach.
  kelvin: number;
};

// The two directions the wall fill burns from, shared by every hour — these are the rig, the per-hour WallFill only its volume.
// A PAIR, DIAGONAL: a directional lights a surface only travelling AGAINST its normal, so one can reach at most two of the four wall faces and a room lit by one has two bright walls and two black.
// These are exact opposites on the diagonal, so every wall is lit by exactly one — which is what makes them EVEN, and why the intensity is per-light rather than a total.
// NEARLY HORIZONTAL, because Lambert scales by the cosine: at y = -0.12 a wall takes ~0.7 while the floor takes ~0.24 from the pair. Tilt toward -1 and the fill becomes a second ambient washing out the sun's pool.
// Not zero, though: a perfectly horizontal fill grazes the wall bottoms and leaves a dark seam where wall meets floor.
export const WALL_FILL_DIRECTIONS: readonly [number, number, number][] = [
  [0.7, -0.12, 0.7],
  [-0.7, -0.12, -0.7],
];

// The player's deviation from an hour's default, STAMPED WITH THE HOUR IT WAS MADE AT — which makes "forget it when the hour changes" a derivation rather than an effect: a stale override is never read.
export type CeilingLightOverride = { hour: TimeOfDayId; on: boolean } | null;

export type SunPreset = {
  label: string;
  // Travel direction of the key light. Null at night, where the room is carried by ambient and lamps.
  direction: Vec3 | null;
  // Key light strength in lux.
  intensity: number;
  // Key light colour temperature. Low = warm.
  kelvin: number;
  // The view out of the room at this hour. One switch drives both: a daytime photo behind a night-lit room reads as a bug.
  backdrop: RoomBackdropId;
  // Ambient probe strength, the stand-in for bounce light, so it can never reach zero or an unwindowed room goes black.
  // SCALE WARNING: room_ibl.ktx is ~4.4× more potent per unit than the stock probe, so a number that looks small here is not. This is why night at 900 still read as daylight.
  ambient: number;
  // The ceiling light at this hour, per preset rather than shared, so night can be a low warm glow while midday stays visible against a 135,000 lux sun.
  interiorLight: CeilingLight;
  // The cool directional fill at this hour, tracking the hour for the same reason interiorLight does.
  counterFill: CounterFill;
  // The wall-readability layer at this hour. Per-hour because how dark walls read depends on what the eye is adapted to: a bright floor pool at midday makes them look blacker than the same walls at morning.
  wallFill: WallFill;
};

// Every direction below has x > 0 and z < 0, the quadrant entering through x-min and z-max. Breaking that produces pools with no visible window; the test asserts it.
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
    // Cool-neutral rather than tinted: in daylight the walls' own cream is what should read, and a warm fill turns them yellow.
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
    // The most fill of any hour, and not a contradiction: the eye adapts to midday's 135k sun, so the walls it never reaches read darker than at any other daylight hour.
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
    // A nearly-horizontal sun throws a 6.7m pool, longer than the room, so this is the hour where intensity buys the most drama per lux — 40k drew that rake too faintly to read as sunset.
    // Still clearly the dimmest daylight hour, because "dim enough that a lamp would start to matter" is the preset's identity; much past this and sunset is a second afternoon with an orange filter.
    intensity: 70_000,
    kelvin: 2_500,
    // Cut when the ceiling light arrived: 1500 was set while sunset had nothing but the probe after the sun dropped, and keeping it on top of a defaulted-on ceiling light lit the room twice and washed out the contrast the low sun draws.
    ambient: 400,
    interiorLight: { defaultOn: true, lumens: 190_000, kelvin: 2_500 },
    // Well off the daylight figure: the low sun is already warm, and a 4000 lux cool fill cancelled exactly the golden cast sunset exists to produce.
    counterFill: { intensity: 800, kelvin: 5_000 },
    // Warm and modest: sunset is a long orange rake against dimming walls, so this only stops them crushing to black — push it and the rake has nothing to be brighter than.
    wallFill: { intensity: 2_200, kelvin: 3_200 },
  },
  // No sun at all. The ambient floor is generous rather than realistic — this is the screen a player arranges furniture on, and it has to stay workable. Lamps make it inviting, not legible.
  night: {
    label: "Night",
    backdrop: "night",
    direction: null,
    intensity: 0,
    kelvin: 4_000,
    // 900 read as daylight, because this probe is ~4.4× more potent per unit — roughly 4000 in stock terms. At 200 it does only a probe's job after dark: keep surfaces off pure black while placed LIGHTING does the lighting.
    // Do not raise this to fix "too dark"; place a light.
    ambient: 200,
    // Warm-incandescent, deliberately warmer than a real fitting: night is the hour this light exists for, and the counter-fill stops it reading as a flat orange wash.
    // The lumens rose WITH the warming — amber reads dimmer than neutral white at equal output, so warming without paying in lumens makes an already-too-dark room darker.
    interiorLight: { defaultOn: true, lumens: 170_000, kelvin: 2_400 },
    // NOT ZERO, and do not make it zero. This is where the constant 4000 lux fill did its damage — brightest and coldest thing in the room — but the fix is to back it off.
    // A faint cool rim gives the warm bulb something to read against, and a flat-warm room is the same failure as a flat-cold one in another hue.
    counterFill: { intensity: 300, kelvin: 4_500 },
    // The hour this rig was asked for, alongside full sun: it is the answer `ambient`'s note demands, the placed light, aimed at the walls rather than lifting the whole room back to daylight.
    // Warm, to sit with the 2400K bulb rather than against it — countering is the counter-fill's job.
    wallFill: { intensity: 1_400, kelvin: 2_900 },
  },
};

export function sunPreset(id: TimeOfDayId): SunPreset {
  return TIME_OF_DAY[id] ?? TIME_OF_DAY.afternoon;
}

// Which of a Room Background's three shots an hour calls for: morning, midday and afternoon all read as "day" outside the window, so five hours collapse to the three a background ships.
export function timeOfDayPhase(id: TimeOfDayId): "day" | "sunset" | "night" {
  if (id === "sunset" || id === "night") return id;
  return "day";
}

// The renderer wants a tuple and Filament has no "no direction", so night points straight down at zero intensity, contributing nothing.
export function sunDirection(preset: SunPreset): [number, number, number] {
  const d = preset.direction ?? { x: 0, y: -1, z: 0 };
  return [d.x, d.y, d.z];
}

// How far a wall of this height throws its pool. Purely diagnostic — the number that made the original low sun unusable (2.3m across a 4.5m room), and the one to check when authoring a preset.
export function poolLength(preset: SunPreset, wallHeight = 2.92): number {
  const d = preset.direction;
  if (!d) return 0;
  return (wallHeight * Math.hypot(d.x, d.z)) / Math.abs(d.y);
}

// Whether the ceiling light is lit. NOT PERSISTED, by design: the default comes from the hour and the hour is the VIEWER's setting, so a room lights itself for whoever is looking — a visitor brings their own, and there is no owned state for two clients to disagree about.
// An override is scoped to the hour it was made at: a player who turned the light off at night made no decision about midday.
export function ceilingLightOn(hour: TimeOfDayId, override: CeilingLightOverride): boolean {
  return override?.hour === hour ? override.on : sunPreset(hour).interiorLight.defaultOn;
}
