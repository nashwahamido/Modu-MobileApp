// The ghost's footprint, drawn OVER the scene: the cells the piece under the finger would occupy, green when it fits and red when it does not.
//
// THE FLOOR GRID IS NOT HERE. The white lines are scene geometry, generated into the shell GLB by scripts/add-shell-grid.mts and faded in by RoomModel. What is left in the overlay is only the part that must NOT be occluded, and the split between the two is the whole design:
//
//   A grid line wants to be hidden by a piece standing over it — the floor is behind the furniture, and should look it. That is exactly what a depth buffer does, so those lines belong in the scene, where the occlusion is exact and costs nothing. Doing it here meant clipping every line against the projected convex hull of every piece in the room, every frame, to approximate a depth test in JavaScript.
//
//   These quads want the opposite. They are the answer to "will it fit here", and the ghost model stands directly on top of them, so the one thing they must never be occluded by is the very piece they are describing. Drawn in the scene they would be invisible precisely when they matter. Here, they are drawn last and drawn over everything, on purpose.
//
// The pose. These project through the SMOOTHED camera — the one the room is actually drawn with, mirrored into React by useSmoothedOrbit in RoomScene — never the raw orbit values. Raw jumps the instant a gesture or a HUD button touches it while the room glides after it for ~0.2 s, and raw only reached React on gesture END, so a raw-driven overlay sat frozen through a whole camera drag and snapped into place on release.
import { memo } from "react";
import Svg, { Path } from "react-native-svg";

import type { OrbitAngles } from "../input/orbit";
import { roomPointToScreen } from "../input/picking";
import { type Vec3 } from "../core/roomShell";
import { StyleSheet } from "react-native";

type Viewport = { width: number; height: number };

// One decimal is a tenth of a pixel — past the point any of this is visible, and it keeps the path strings short enough to be worth re-serialising each frame.
const round = (n: number) => Math.round(n * 10) / 10;

export const GridOverlay = memo(function GridOverlay({
  viewport,
  angles,
  ghostQuads,
  ghostValid,
}: {
  viewport: Viewport;
  angles: OrbitAngles;
  // Each ghost cell as its four room-space corners, precomputed by the caller — the overlay just projects and draws, so floor cells and elevated tabletop cells are the same code here.
  ghostQuads: { key: string; corners: [Vec3, Vec3, Vec3, Vec3] }[];
  ghostValid: boolean;
}) {
  const quads: string[] = [];
  for (const { corners } of ghostQuads) {
    const pts = corners.map((c) => roomPointToScreen(c, viewport, angles));
    // A corner behind the eye has no screen point at all; the cell is simply not drawn. Only reachable with the camera zoomed inside the piece.
    if (!pts.every(Boolean)) continue;
    quads.push(`M${pts.map((p) => `${round(p!.x)} ${round(p!.y)}`).join("L")}Z`);
  }

  if (quads.length === 0) return null;

  return (
    <Svg
      pointerEvents="none"
      style={styles.overlay}
      width={viewport.width}
      height={viewport.height}
    >
      <Path
        d={quads.join("")}
        fill={ghostValid ? "rgba(96,190,110,0.30)" : "rgba(214,72,72,0.32)"}
        stroke={ghostValid ? "rgba(96,190,110,0.9)" : "rgba(214,72,72,0.9)"}
        strokeWidth={1}
      />
    </Svg>
  );
});

const styles = StyleSheet.create({
  // Between the Filament view and the gesture layer; input passes straight through.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
});
