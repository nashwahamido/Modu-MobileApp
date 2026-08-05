// The room's own backdrop set, kept apart from the assembly scene's (src/game/ui/backdrop/backdrops.ts): the room is a place you live in, so its photos change independently of the build screen's artwork. Room-only images live in src/assets/images/backdrops/room/ — drop a file there and add one entry below. Metro resolves require() at build time, so every image needs its own literal path (no globbing, no runtime paths). One entry per hour in TIME_OF_DAY (src/room/core/timeOfDay.ts), keyed by the same id: the sun preset names the photo it belongs with, so an hour and its view out of the window are chosen together and cannot drift apart. Each entry names the same photo for light and dark on purpose: the hour is the player's choice, not a follower of the app theme — switching the app to dark must not turn a midday room into a night one. No labels here: an hour is presented by SunPreset.label next to its lighting, and a second set of names for the same five ids could only disagree with it.

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
    light: require("../../assets/images/backdrops/room/midday.png"),
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
