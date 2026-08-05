// The room's own backdrop set, kept apart from the assembly scene's (src/game/ui/backdrops.ts): the room is a place you live in, so its photos change independently of the build screen's artwork.
// Room-only images live in src/assets/images/backdrops/room/ — drop a file there and add one entry below. Metro resolves require() at build time, so every image needs its own literal path (no globbing, no runtime paths).
// Each entry names the same photo for light and dark on purpose: "Daytime" and "Nighttime" are the player's choice of hour, not a follower of the app theme — the theme must not turn a daytime room dark.

export type RoomBackdrop = {
  id: string;
  label: string;
  /** Omitted only for "clear": no image at all, so the screen's own themed background shows through. */
  light?: number;
  /** Optional — a photo with no night version is shown in both themes. */
  dark?: number;
  /** How the photo meets the screen. "cover" (the default) fills it and crops whatever does not fit the device's aspect; "contain" shows the whole photo and lets the themed background show at the edges. A 4:3 photo loses ~40% of its height to "cover" on a phone in landscape, so photos that are not already screen-shaped want "contain". */
  fit?: "cover" | "contain";
};

export const ROOM_BACKDROPS = [
  {
    id: "morning",
    label: "Morning",
    light: require("../../assets/images/backdrops/room/daytime.png"),
    dark: require("../../assets/images/backdrops/room/daytime.png"),
  },
  {
    id: "midday",
    label: "Midday",
    light: require("../../assets/images/backdrops/room/daytime.png"),
    dark: require("../../assets/images/backdrops/room/daytime.png"),
  },
  {
    id: "afternoon",
    label: "Afternoon",
    light: require("../../assets/images/backdrops/room/daytime.png"),
    dark: require("../../assets/images/backdrops/room/daytime.png"),
  },
  {
    id: "sunset",
    label: "Sunset",
    light: require("../../assets/images/backdrops/room/daytime.png"),
    dark: require("../../assets/images/backdrops/room/daytime.png"),
  },
  {
    id: "night",
    label: "Night",
    light: require("../../assets/images/backdrops/room/nighttime.png"),
    dark: require("../../assets/images/backdrops/room/nighttime.png"),
  },
] as const satisfies readonly RoomBackdrop[];

export type RoomBackdropId = (typeof ROOM_BACKDROPS)[number]["id"];

// The Settings picker reads this, so a new entry above shows up in the app without touching the settings screen.
export const ROOM_BACKDROP_OPTIONS: { value: RoomBackdropId; label: string }[] =
  ROOM_BACKDROPS.map((b) => ({ value: b.id, label: b.label }));

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
