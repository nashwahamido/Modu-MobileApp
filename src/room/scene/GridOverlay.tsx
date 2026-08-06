// The editing grid, drawn OVER the scene rather than in it: perspective projection maps straight floor lines to straight screen lines, so the whole overlay is a handful of SVG segments through the same camera math the picking ray inverts (src/room/input/picking.ts). Visible only while a ghost is active — players need to see cells to think in them, and never otherwise.
//
// Two things make it read as being ON the floor rather than painted on the lens.
//
// The pose. It projects through the SMOOTHED camera — the one the room is actually drawn with, mirrored into React by useSmoothedOrbit in RoomScene — never the raw orbit values. Raw jumps the instant a gesture or a HUD button touches it while the room glides after it for ~0.2 s, and raw only reached React on gesture END, so a raw-driven grid sat frozen through a whole camera drag and snapped into place on release.
//
// The occlusion. An SVG overlay has no depth buffer, so every line is clipped against the projected silhouettes of the pieces standing in the room (../core/gridOcclusion) and the hidden parts are drawn at a much lower alpha instead of over the furniture. Grid lines are emitted as two Paths — one clear, one occluded — rather than one node per line, because this whole tree re-renders every frame the camera moves and a couple of long `d` strings diff far cheaper than forty elements.
import { memo } from "react";
import Svg, { Path } from "react-native-svg";

import type { OrbitAngles } from "../input/orbit";
import { roomPointToScreen } from "../input/picking";
import { clearSpans, coveredSpans, type Pt } from "../core/gridOcclusion";
import { FLOOR_CELLS, ROOM_SHELL, type Vec3 } from "../core/roomShell";
import { StyleSheet } from "react-native";

type Viewport = { width: number; height: number };

const CELL = ROOM_SHELL.cellSize;
const { floor } = ROOM_SHELL;

// Bright enough to count cells against the floor, dim enough behind a piece that the piece plainly wins.
const CLEAR_STROKE = "rgba(255,255,255,0.38)";
const OCCLUDED_STROKE = "rgba(255,255,255,0.09)";

function project(x: number, z: number, viewport: Viewport, angles: OrbitAngles) {
  return roomPointToScreen({ x, y: floor.y, z }, viewport, angles);
}

// One decimal is a tenth of a pixel — past the point any of this is visible, and it keeps the path strings short enough to be worth re-serialising each frame.
const round = (n: number) => Math.round(n * 10) / 10;

// Append `M ... L ...` for each parametric span of the segment a -> b.
function appendRuns(into: string[], a: Pt, b: Pt, spans: readonly (readonly [number, number])[]) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [t0, t1] of spans) {
    into.push(
      `M${round(a.x + dx * t0)} ${round(a.y + dy * t0)}L${round(a.x + dx * t1)} ${round(a.y + dy * t1)}`,
    );
  }
}

export const GridOverlay = memo(function GridOverlay({
  viewport,
  angles,
  occluders,
  ghostQuads,
  ghostValid,
}: {
  viewport: Viewport;
  angles: OrbitAngles;
  // The screen-space silhouettes of the pieces already in the room, as convex hulls — projected by the caller, which is the layer that holds the layout and the catalog. Empty means nothing is dimmed.
  occluders: readonly (readonly Pt[])[];
  // Each ghost cell as its four room-space corners, precomputed by the caller — the overlay just projects and draws, so floor cells and elevated tabletop cells are the same code here.
  ghostQuads: { key: string; corners: [Vec3, Vec3, Vec3, Vec3] }[];
  ghostValid: boolean;
}) {
  const clear: string[] = [];
  const occluded: string[] = [];

  const addLine = (a: Pt | null, b: Pt | null) => {
    if (!a || !b) return;
    const covered = coveredSpans(a, b, occluders);
    appendRuns(occluded, a, b, covered);
    appendRuns(clear, a, b, clearSpans(covered));
  };

  for (let i = 0; i <= FLOOR_CELLS.w; i += 1) {
    const x = floor.minX + i * CELL;
    addLine(project(x, floor.minZ, viewport, angles), project(x, floor.minZ + FLOOR_CELLS.d * CELL, viewport, angles));
  }
  for (let j = 0; j <= FLOOR_CELLS.d; j += 1) {
    const z = floor.minZ + j * CELL;
    addLine(project(floor.minX, z, viewport, angles), project(floor.minX + FLOOR_CELLS.w * CELL, z, viewport, angles));
  }

  // The ghost's own cells stay at full strength whatever stands over them: they are the answer to "will it fit here", and dimming the feedback exactly where a collision is about to be reported would hide the thing the player is being shown.
  const quads: string[] = [];
  for (const { corners } of ghostQuads) {
    const pts = corners.map((c) => roomPointToScreen(c, viewport, angles));
    if (!pts.every(Boolean)) continue;
    quads.push(`M${pts.map((p) => `${round(p!.x)} ${round(p!.y)}`).join("L")}Z`);
  }

  return (
    <Svg
      pointerEvents="none"
      style={styles.overlay}
      width={viewport.width}
      height={viewport.height}
    >
      {occluded.length > 0 ? (
        <Path d={occluded.join("")} stroke={OCCLUDED_STROKE} strokeWidth={1} fill="none" />
      ) : null}
      {clear.length > 0 ? (
        <Path d={clear.join("")} stroke={CLEAR_STROKE} strokeWidth={1} fill="none" />
      ) : null}
      {quads.length > 0 ? (
        <Path
          d={quads.join("")}
          fill={ghostValid ? "rgba(96,190,110,0.30)" : "rgba(214,72,72,0.32)"}
          stroke={ghostValid ? "rgba(96,190,110,0.9)" : "rgba(214,72,72,0.9)"}
          strokeWidth={1}
        />
      ) : null}
    </Svg>
  );
});

const styles = StyleSheet.create({
  // Between the Filament view and the gesture layer; input passes straight through.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
});
