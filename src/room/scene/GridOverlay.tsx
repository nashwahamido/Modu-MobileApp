// The editing grid, drawn OVER the scene rather than in it: perspective projection maps straight
// floor lines to straight screen lines, so the whole overlay is a handful of SVG segments through
// the same camera math the picking ray inverts (src/room/input/picking.ts). Visible only while a ghost
// is active — players need to see cells to think in them, and never otherwise.
//
// The overlay projects through the SETTLED camera pose (raw orbit values). While editing, the pan
// gesture moves the ghost instead of the camera, so the pose only changes through HUD buttons or a
// pinch — both of which re-render this component when they commit. During the brief glide after
// one, the grid leads the room slightly; accepted, the alternative is per-frame JS reprojection.
import { memo } from "react";
import Svg, { Line, Polygon } from "react-native-svg";

import type { Cell } from "../core/grid";
import type { OrbitAngles } from "../input/orbit";
import { roomPointToScreen } from "../input/picking";
import { FLOOR_CELLS, ROOM_SHELL } from "../core/roomShell";
import { StyleSheet } from "react-native";

type Viewport = { width: number; height: number };

const CELL = ROOM_SHELL.cellSize;
const { floor } = ROOM_SHELL;

function project(x: number, z: number, viewport: Viewport, angles: OrbitAngles) {
  return roomPointToScreen({ x, y: floor.y, z }, viewport, angles);
}

export const GridOverlay = memo(function GridOverlay({
  viewport,
  angles,
  ghostCells,
  ghostValid,
}: {
  viewport: Viewport;
  angles: OrbitAngles;
  // The ghost's mask-aware footprint cells (from cellsFor), highlighted on the floor in its check colour.
  ghostCells: Cell[];
  ghostValid: boolean;
}) {
  const lines: { key: string; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];

  for (let i = 0; i <= FLOOR_CELLS.w; i += 1) {
    const x = floor.minX + i * CELL;
    const a = project(x, floor.minZ, viewport, angles);
    const b = project(x, floor.minZ + FLOOR_CELLS.d * CELL, viewport, angles);
    if (a && b) lines.push({ key: `v${i}`, a, b });
  }
  for (let j = 0; j <= FLOOR_CELLS.d; j += 1) {
    const z = floor.minZ + j * CELL;
    const a = project(floor.minX, z, viewport, angles);
    const b = project(floor.minX + FLOOR_CELLS.w * CELL, z, viewport, angles);
    if (a && b) lines.push({ key: `h${j}`, a, b });
  }

  const cellQuads = ghostCells
    .map((cell) => {
      const x0 = floor.minX + cell.x * CELL;
      const z0 = floor.minZ + cell.y * CELL;
      const corners = [
        project(x0, z0, viewport, angles),
        project(x0 + CELL, z0, viewport, angles),
        project(x0 + CELL, z0 + CELL, viewport, angles),
        project(x0, z0 + CELL, viewport, angles),
      ];
      return corners.every(Boolean) ? { key: `${cell.x},${cell.y}`, points: corners.map((c) => `${c!.x},${c!.y}`).join(" ") } : null;
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  return (
    <Svg
      pointerEvents="none"
      style={styles.overlay}
      width={viewport.width}
      height={viewport.height}
    >
      {lines.map(({ key, a, b }) => (
        <Line
          key={key}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="rgba(255,255,255,0.38)"
          strokeWidth={1}
        />
      ))}
      {cellQuads.map(({ key, points }) => (
        <Polygon
          key={key}
          points={points}
          fill={ghostValid ? "rgba(96,190,110,0.30)" : "rgba(214,72,72,0.32)"}
          stroke={ghostValid ? "rgba(96,190,110,0.9)" : "rgba(214,72,72,0.9)"}
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
});

const styles = StyleSheet.create({
  // Between the Filament view and the gesture layer; input passes straight through.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
});
