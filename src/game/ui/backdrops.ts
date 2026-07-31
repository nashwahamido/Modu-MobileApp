// Per-backdrop images (from the on-release engine's set), each with a dark variant. The Background setting picks the key; Dark mode picks the variant.
// Consumed only through ui/SceneBackdrop, which renders the image identically on every screen (play, tutorial, room) — see backdropSource for the "clear" / studio-fallback rules.
import type { BackdropId } from "@/src/game/core/type";

const BACKDROPS: Record<string, { light: number; dark: number }> = {
  studio: {
    light: require("../../assets/images/backdrops/studio-light.png"),
    dark: require("../../assets/images/backdrops/studio-dark.png"),
  },
  cozy: {
    light: require("../../assets/images/backdrops/cozy-light.png"),
    dark: require("../../assets/images/backdrops/cozy-dark.png"),
  },
  cartoon: {
    light: require("../../assets/images/backdrops/cartoon-light.png"),
    dark: require("../../assets/images/backdrops/cartoon-dark.png"),
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
