import type { BackdropId } from "@/src/game/core/type";

const BACKDROPS: Record<string, { light: number; dark: number }> = {
  grid: {
    light: require("@/src/assets/images/backdrops/assemble/grid-light.png"),
    dark: require("@/src/assets/images/backdrops/assemble/grid-dark.png"),
  },
  calm: {
    light: require("@/src/assets/images/backdrops/assemble/calm-light.jpg"),
    dark: require("@/src/assets/images/backdrops/assemble/calm-dark.jpg"),
  },
  craft: {
    light: require("@/src/assets/images/backdrops/assemble/craft-light.jpg"),
    dark: require("@/src/assets/images/backdrops/assemble/craft-dark.jpg"),
  },
  garden: {
    light: require("@/src/assets/images/backdrops/assemble/garden-light.jpg"),
    dark: require("@/src/assets/images/backdrops/assemble/garden-dark.jpg"),
  },
};

export function backdropSource(
  backdrop: BackdropId,
  dark: boolean,
): number | undefined {
  if (backdrop === "clear") return undefined;
  const set = BACKDROPS[backdrop] ?? BACKDROPS.grid;
  return dark && set === BACKDROPS.grid ? set.dark : set.light;
}