import assert from "node:assert/strict";
import { test } from "node:test";

import { ORBIT } from "../input/orbit";
import { SHELL_WALL_IDS } from "./roomShell";
import {
  WALL_ALPHA_EPSILON,
  WALL_FADE_BAND,
  hiddenWalls,
  shellWallMaterials,
  shellWallOfMaterial,
  wallAlpha,
  wallAlphas,
} from "./wallCulling";

test("the rest pose hides exactly the two walls the diorama always had open", () => {
  // restTheta 3π/4 puts the eye in the +x/-z quadrant, outside x-max and z-min — the two sides the shell used not to have, so the starting view is unchanged by adding them.
  assert.deepEqual(hiddenWalls(ORBIT.restTheta).sort(), ["x-max", "z-min"]);
  const alphas = wallAlphas(ORBIT.restTheta);
  assert.equal(alphas["x-min"], 1);
  assert.equal(alphas["z-max"], 1);
  assert.equal(alphas["x-max"], 0);
  assert.equal(alphas["z-min"], 0);
});

test("one or two adjacent walls are hidden at every azimuth, never an opposite pair", () => {
  // The invariant that makes the trick work: two walls hidden at a generic angle, one when the camera lines up with an axis.
  // A mis-signed normal shows up as 0, 3, 4, or an opposite pair — looking through the room from both sides at once.
  for (let i = 0; i < 720; i += 1) {
    const theta = (i / 720) * 2 * Math.PI;
    const hidden = hiddenWalls(theta);
    assert.ok(hidden.length === 1 || hidden.length === 2, `theta ${theta}: ${hidden.join()}`);
    assert.notDeepEqual(hidden.sort(), ["x-max", "x-min"]);
    assert.notDeepEqual(hidden.sort(), ["z-max", "z-min"]);
  }
});

test("a wall seen edge-on stays solid", () => {
  // theta 0 looks along +z: the x walls go edge-on and block nothing, and hiding a wall that is not in the way just deletes part of the room.
  assert.equal(wallAlpha("x-min", 0), 1);
  assert.equal(wallAlpha("x-max", 0), 1);
  assert.equal(wallAlpha("x-min", Math.PI), 1);
  assert.equal(wallAlpha("x-max", Math.PI), 1);
  assert.equal(wallAlpha("z-min", Math.PI / 2), 1);
  assert.equal(wallAlpha("z-max", Math.PI / 2), 1);
});

test("alpha is continuous across the fade band — no pop at any boundary", () => {
  for (const wall of SHELL_WALL_IDS) {
    let previous = wallAlpha(wall, -Math.PI);
    for (let i = 1; i <= 20_000; i += 1) {
      const theta = -Math.PI + (i / 20_000) * 2 * Math.PI;
      const alpha = wallAlpha(wall, theta);
      assert.ok(alpha >= 0 && alpha <= 1, `${wall} alpha out of range at ${theta}`);
      // A pop is a step. Sampled this finely the smoothstep never moves more than a hair per step.
      assert.ok(Math.abs(alpha - previous) < 0.01, `${wall} jumped ${alpha - previous} at ${theta}`);
      previous = alpha;
    }
  }
});

test("the fade band is one-sided: solid until blocking, gone shortly after", () => {
  // x-max starts to block as theta passes 0. Right up to that instant it must be fully solid — a straight-on room is a solid back wall between two solid slivers — and by the band's end fully gone.
  const gone = Math.asin(WALL_FADE_BAND);
  assert.equal(wallAlpha("x-max", 0), 1);
  assert.equal(wallAlpha("x-max", -0.01), 1);
  assert.ok(wallAlpha("x-max", gone / 2) < 1);
  assert.ok(wallAlpha("x-max", gone / 2) > 0);
  assert.equal(wallAlpha("x-max", gone + 0.01), 0);
});

test("rotation is periodic — a full turn returns the same alphas", () => {
  // theta is left unbounded rather than wrapped, so a room spun many turns must still cull correctly.
  for (const turns of [1, 2, -3, 17]) {
    const spun = ORBIT.restTheta + turns * 2 * Math.PI;
    const alphas = wallAlphas(spun);
    for (const wall of SHELL_WALL_IDS) {
      assert.ok(
        Math.abs(alphas[wall] - wallAlpha(wall, ORBIT.restTheta)) < 1e-9,
        `${wall} drifted after ${turns} turns`,
      );
    }
  }
});

test("a wall item's opacity is its wall's, at every angle — no second curve to drift from it", () => {
  // The renderer drives a window's alpha straight off its wall's, so no separate schedule can disagree.
  // This pins what replaced the old pop thresholds: a window is never more or less present than the wall holding it, anywhere in the band. Any item-side easing puts the glitch straight back.
  for (const wall of SHELL_WALL_IDS) {
    for (let i = 0; i <= 4_000; i += 1) {
      const theta = -Math.PI + (i / 4_000) * 2 * Math.PI;
      const alpha = wallAlpha(wall, theta);
      assert.ok(alpha >= 0 && alpha <= 1, `${wall} item alpha out of range at ${theta}`);
      // The one threshold left is the renderer's: below an alpha byte the piece leaves the scene rather than cost a transparent draw. It must sit at the invisible end of the fade, or a still-visible window vanishes.
      if (alpha > WALL_ALPHA_EPSILON) assert.ok(alpha > 0, `${wall} drawn at zero alpha at ${theta}`);
    }
  }
  // No hysteresis is needed there, which is the proof the fade works: either side of it the piece is equally invisible, so a camera parked exactly there can flicker freely with nothing to see.
  assert.ok(WALL_ALPHA_EPSILON <= 1 / 255);
});

test("material names round-trip to their wall, and nothing else matches", () => {
  for (const wall of SHELL_WALL_IDS) {
    const [wallMat, trimMat] = shellWallMaterials(wall);
    assert.equal(shellWallOfMaterial(wallMat), wall);
    // The cornice must fade WITH its wall — a trim run left hanging over a hidden wall is worse than no trim at all.
    assert.equal(shellWallOfMaterial(trimMat), wall);
  }
  // The surfaces that never cull, and anything from a furniture GLB, must not be swept up.
  assert.equal(shellWallOfMaterial("Floor"), null);
  assert.equal(shellWallOfMaterial("FloorEdge"), null);
  assert.equal(shellWallOfMaterial("Wall"), null);
  assert.equal(shellWallOfMaterial("Painted Plaster Wall"), null);
  assert.equal(shellWallOfMaterial("Wall_middle"), null);
});
