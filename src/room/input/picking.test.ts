import assert from "node:assert/strict";
import { test } from "node:test";

import { clampToSurface, floorCellToRoom } from "../core/grid";
import { ORBIT } from "./orbit";
import { roomPointToScreen, screenPointToFloorCell, screenPointToFloorScene } from "./picking";
import { FLOOR_CELLS, ROOM_SHELL, sceneToRoom } from "../core/roomShell";

const VIEWPORT = { width: 1200, height: 800 };
const REST = { radius: ORBIT.homeRadius, phi: ORBIT.phi.rest, theta: ORBIT.restTheta };

// The angles a player actually reaches: corners of the clamp box plus the rest pose.
const ANGLE_SAMPLES = [
  REST,
  { radius: ORBIT.homeRadius / 2, phi: ORBIT.phi.min + 0.05, theta: ORBIT.restTheta - 0.7 },
  { radius: ORBIT.homeRadius / 0.6, phi: ORBIT.phi.max - 0.05, theta: ORBIT.restTheta + 0.7 },
];

test("picking inverts projection: every floor cell round-trips through the screen", () => {
  for (const angles of ANGLE_SAMPLES) {
    for (const cell of [
      { x: 0, y: 0 },
      { x: 10, y: 9 },
      { x: 5, y: 4 },
      { x: 2, y: 7 },
    ]) {
      const centre = floorCellToRoom(cell, { w: 1, d: 1 });
      const screen = roomPointToScreen(centre, VIEWPORT, angles);
      assert.ok(screen, `cell ${cell.x},${cell.y} projects behind the camera`);
      const picked = screenPointToFloorCell(screen.x, screen.y, VIEWPORT, angles);
      assert.deepEqual(picked, cell, `round-trip failed at radius ${angles.radius.toFixed(2)}`);
    }
  }
});

test("a picked hit lies exactly on the floor plane", () => {
  const hit = screenPointToFloorScene(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT, REST);
  assert.ok(hit);
  const room = sceneToRoom(hit);
  assert.ok(Math.abs(room.y - ROOM_SHELL.floor.y) < 1e-9);
});

test("pointing at the sky picks nothing", () => {
  // The top of the screen at the rest pose looks over the cornice line — no floor intersection in
  // front of the camera.
  const picked = screenPointToFloorCell(VIEWPORT.width / 2, -VIEWPORT.height, VIEWPORT, REST);
  assert.equal(picked, null);
});

test("the screen centre picks just off the open corner — and clamps back onto the grid", () => {
  // The camera aims at the room's AIR centre, so the ray through the screen centre overshoots the
  // floor toward the diorama's open side and lands a few centimetres off-grid. That is correct
  // behaviour: the drag pipeline runs every picked cell through clampToSurface, which is what this
  // pins down.
  const picked = screenPointToFloorCell(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT, REST);
  assert.ok(picked);
  // Off-grid, but only barely — a wildly wrong basis would land tens of cells away.
  assert.ok(picked.x >= -2 && picked.x <= FLOOR_CELLS.w + 1);
  assert.ok(picked.y >= -2 && picked.y <= FLOOR_CELLS.d + 1);
  const clamped = clampToSurface(picked, { kind: "floor" }, { w: 1, d: 1 });
  assert.ok(clamped.x >= 0 && clamped.x < FLOOR_CELLS.w);
  assert.ok(clamped.y >= 0 && clamped.y < FLOOR_CELLS.d);
});
