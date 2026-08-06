// Per-backdrop images (from the on-release engine's set), each with a dark variant. The Background setting picks the key; Dark mode picks the variant. The assembly screens' set (play, tutorial), from assets/images/backdrops/assemble/. The room has its own table and folder next door — src/room/ui/roomBackdrops, assets/images/backdrops/room/. Rendered through ui/backdrop/SceneBackdrop, which draws the image identically on every screen — see backdropSource for the "clear" / studio-fallback rules.
import type { BackdropId } from "@/src/game/core/type";

const BACKDROPS: Record<string, { light: number; dark: number }> = {
  studio: {
    light: require("@/src/assets/images/backdrops/assemble/studio-light.png"),
    dark: require("@/src/assets/images/backdrops/assemble/studio-dark.png"),
  },
  cozy: {
    light: require("@/src/assets/images/backdrops/assemble/cozy-light.png"),
    dark: require("@/src/assets/images/backdrops/assemble/cozy-dark.png"),
  },
  cartoon: {
    light: require("@/src/assets/images/backdrops/assemble/cartoon-light.png"),
    dark: require("@/src/assets/images/backdrops/assemble/cartoon-dark.png"),
  },
};

// The image source for a backdrop, or undefined for "clear" (no image — the scene root shows through). Unknown keys fall back to studio.
export function backdropSource(
  backdrop: BackdropId,
  dark: boolean,
): number | undefined {
  if (backdrop === "clear") return undefined;
  return (BACKDROPS[backdrop] ?? BACKDROPS.studio)[dark ? "dark" : "light"];
}
