export const ROOM_BACKGROUND = require("../../assets/images/backdrops/room/room-bg.jpg");

export type RoomBackdrop = {
  id: string;
  light?: number;
  dark?: number;
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

export function roomBackdropView(
  id: RoomBackdropId,
  dark: boolean,
): { source: number | undefined; fit: "cover" | "contain" } {
  const entry: RoomBackdrop | undefined = ROOM_BACKDROPS.find((b) => b.id === id);
  if (!entry) {
    return {
      source: undefined,
      fit: "cover",
    };
  }
  const source = dark && entry.dark !== undefined ? entry.dark : entry.light;
  return {
    source,
    fit: entry.fit ?? "cover",
  };
}

export type RoomBackgroundId = "bg4" | "bg6" | "bg7" | "bg9";

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

export function roomBackgroundView(
  background: RoomBackgroundId,
  phase: RoomBackgroundPhase,
): { source: number; fit: "cover" } {
  return {
    source: ROOM_BACKGROUNDS[background][phase],
    fit: "cover",
  };
}
