// The room's own backdrop set, kept apart from the assembly scene's (src/game/ui/backdrop/backdrops.ts): the room is a place you live in, so its photos change independently of the build screen's artwork. Room-only images live in src/assets/images/backdrops/room/ — drop a file there and add one entry below. Metro resolves require() at build time, so every image needs its own literal path (no globbing, no runtime paths). One entry per hour in TIME_OF_DAY (src/room/core/timeOfDay.ts), keyed by the same id: the sun preset names the photo it belongs with, so an hour and its view out of the window are chosen together and cannot drift apart. Each entry names the same photo for light and dark on purpose: the hour is the player's choice, not a follower of the app theme — switching the app to dark must not turn a midday room into a night one. No labels here: an hour is presented by SunPreset.label next to its lighting, and a second set of names for the same five ids could only disagree with it.

export const ROOM_BACKGROUND = require("../../assets/images/backdrops/room/room-bg.jpg");

export type RoomBackdrop = {
  id: string;
  /** Optional so an entry can carry no image at all, leaving the screen's own themed background to show through. Every hour in the current set has one. */
  light?: number;
  /** Optional — a photo with no night version is shown in both themes. */
  dark?: number;
  /** How the photo meets the screen. "cover" (the default) fills it and crops whatever does not fit the device's aspect; "contain" shows the whole photo and lets the themed background show at the edges. A 4:3 photo loses ~40% of its height to "cover" on a phone in landscape, so photos that are not already screen-shaped want "contain". */
  fit?: "cover" | "contain";
};

export const ROOM_BACKDROPS = [
  {
    id: "morning",
    light: require("../../assets/images/backdrops/room/morning.png"),
    dark: require("../../assets/images/backdrops/room/morning.png"),
  },
  {
    id: "midday",
    light: require("../../assets/images/backdrops/room/bg10.jpg"),
    dark: require("../../assets/images/backdrops/room/midday.png"),
  },
  {
    id: "afternoon",
    light: require("../../assets/images/backdrops/room/afternoon.png"),
    dark: require("../../assets/images/backdrops/room/afternoon.png"),
  },
  {
    id: "sunset",
    light: require("../../assets/images/backdrops/room/sunset.png"),
    dark: require("../../assets/images/backdrops/room/sunset.png"),
  },
  {
    id: "night",
    light: require("../../assets/images/backdrops/room/night.png"),
    dark: require("../../assets/images/backdrops/room/night.png"),
  },
] as const satisfies readonly RoomBackdrop[];

export type RoomBackdropId = (typeof ROOM_BACKDROPS)[number]["id"];

/** What the room screen hands to SceneBackdrop: the image for this backdrop (undefined when it has none, or the id is no longer in the table) and how to fit it. */
export function roomBackdropView(
  id: RoomBackdropId,
  dark: boolean,
): { source: number | undefined; fit: "cover" | "contain" } {
  const entry: RoomBackdrop | undefined = ROOM_BACKDROPS.find((b) => b.id === id);
  if (!entry) return { source: undefined, fit: "cover" };
  const source = dark && entry.dark !== undefined ? entry.dark : entry.light;
  return { source, fit: entry.fit ?? "cover" };
}

// The player-chosen "Room Background" (Settings > General), independent of the hour: this picks
// WHICH photo hangs outside the window, while the hour (RoomLightControls, on the room HUD) picks
// what time of day it shows. Each background carries exactly three shots — day, sunset, night — so
// the two settings compose into one view without a separate entry per hour of TIME_OF_DAY.
// bg8 is deliberately absent: unlike every other id here it has no -sunset/-night shots, only a day
// one, so it cannot follow the hour the way the rest of this set does.
export type RoomBackgroundId = "bg4" | "bg6" | "bg7" | "bg9";

// bg7 first: it is the default, so it heads the list rather than sitting among the scenery (see the
// same ordering rule on BACKDROPS in game/ui/settings/sections.tsx).
export const ROOM_BACKGROUND_IDS: readonly RoomBackgroundId[] = ["bg7", "bg4", "bg6", "bg9"];

export type RoomBackgroundPhase = "day" | "sunset" | "night";

const ROOM_BACKGROUNDS: Record<RoomBackgroundId, Record<RoomBackgroundPhase, number>> = {
  bg4: {
    day: require("../../assets/images/backdrops/room/bg4.jpg"),
    sunset: require("../../assets/images/backdrops/room/bg4-sunset.jpg"),
    night: require("../../assets/images/backdrops/room/bg4-night.jpg"),
  },
  bg6: {
    day: require("../../assets/images/backdrops/room/bg6.jpg"),
    sunset: require("../../assets/images/backdrops/room/bg6-sunset.jpg"),
    night: require("../../assets/images/backdrops/room/bg6-night.jpg"),
  },
  bg7: {
    day: require("../../assets/images/backdrops/room/bg7.jpg"),
    sunset: require("../../assets/images/backdrops/room/bg7-sunset.jpg"),
    night: require("../../assets/images/backdrops/room/bg7-night.jpg"),
  },
  bg9: {
    day: require("../../assets/images/backdrops/room/bg9.jpg"),
    sunset: require("../../assets/images/backdrops/room/bg9-sunset.jpg"),
    night: require("../../assets/images/backdrops/room/bg9-night.jpg"),
  },
};

/** What the room screen hands to SceneBackdrop for the player's chosen background, at the given
 * phase of the day (see timeOfDayPhase in room/core/timeOfDay.ts for how an hour maps to one). */
export function roomBackgroundView(
  background: RoomBackgroundId,
  phase: RoomBackgroundPhase,
): { source: number; fit: "cover" } {
  return { source: ROOM_BACKGROUNDS[background][phase], fit: "cover" };
}
