// Per-backdrop images, each with a dark variant. The Background setting picks the key; Dark mode picks the variant. The assembly screens' set (play, tutorial), from assets/images/backdrops/assemble/. The room has its own table and folder next door — src/room/ui/roomBackdrops, assets/images/backdrops/room/. Rendered through ui/backdrop/SceneBackdrop, which draws the image identically on every screen — see backdropSource for the "clear" fallback rule.
//
// GRID IS THE DEFAULT, and the fallback for an unknown key: it is the neutral one. A photographic backdrop competes with the model for attention, which is fine as a choice and wrong as a starting point — the grid reads as a work surface and gets out of the way.
//
// Grid ships as PNG because it is flat line art with an alpha channel, where JPEG would ring along every line. The three photographic backdrops are JPEG at 2048px: they have no transparency, and as PNGs the same images were tens of megabytes for no visible gain.
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

// The image source for a backdrop, or undefined for "clear" (no image — the scene root shows through). Unknown keys fall back to grid, which also covers a profile saved with one of the retired ids.
export function backdropSource(
  backdrop: BackdropId,
  dark: boolean,
): number | undefined {
  if (backdrop === "clear") return undefined;
  return (BACKDROPS[backdrop] ?? BACKDROPS.grid)[dark ? "dark" : "light"];
}