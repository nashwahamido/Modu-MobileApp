import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORBIT,
  clampOrbit,
  controlsFromOrbit,
  eyeFor,
  orbitFromControls,
  restOrbit,
  smoothingAlpha,
} from "./orbit";
test("orbit clamps radius and phi, and leaves rotation free", () => {
  const wild = clampOrbit({ radius: 999, phi: 9, theta: 99 });
  assert.equal(wild.radius, ORBIT.homeRadius / ORBIT.zoom.min);
  assert.equal(wild.phi, ORBIT.phi.max);

  const tight = clampOrbit({ radius: 0, phi: 0, theta: -99 });
  assert.equal(tight.radius, ORBIT.homeRadius / ORBIT.zoom.max);
  assert.equal(tight.phi, ORBIT.phi.min);
});

test("theta passes through untouched — the room turns all the way round", () => {
  // The yaw clamp existed because the shell had two walls and showed its open back past ±45°. With
  // four walls and camera-facing culling every azimuth reads as a room, so nothing bounds theta.
  for (const theta of [-99, -Math.PI, 0, ORBIT.restTheta, 7, 99]) {
    assert.equal(clampOrbit({ radius: ORBIT.homeRadius, phi: ORBIT.phi.rest, theta }).theta, theta);
  }
});

test("close-up zoom is allowed but never enters the near plane", () => {
  // The user zooms in to inspect one piece: 300% puts the eye at radius ~3.3 in a 2-unit-cube
  // scene — close, but still outside the room's bounding sphere plus the 0.1 near plane.
  assert.ok(ORBIT.zoom.max >= 3);
  assert.ok(ORBIT.homeRadius / ORBIT.zoom.max > Math.SQRT2 + 0.5);
});

test("phi can never reach level or below — the floor always reads as a floor", () => {
  assert.ok(ORBIT.phi.max < Math.PI / 2);
  assert.ok(ORBIT.phi.min > 0);
});

test("HUD controls and orbit angles are inverse of each other", () => {
  const orbit = orbitFromControls(0.3, 1.2);
  const controls = controlsFromOrbit(orbit);
  assert.ok(Math.abs(controls.rotationY - 0.3) < 1e-12);
  assert.ok(Math.abs(controls.zoom - 1.2) < 1e-12);

  // Neutral controls sit exactly at the rest pose.
  const rest = orbitFromControls(0, 1);
  assert.equal(rest.theta, ORBIT.restTheta);
  assert.equal(rest.radius, ORBIT.homeRadius);
});

test("rotationY keeps its old visual direction on the camera", () => {
  // Rotating the room +y used to swing the scene one way; orbiting the camera the OPPOSITE way
  // shows the same view, which is why theta runs against rotationY.
  const turned = orbitFromControls(0.4, 1);
  assert.ok(turned.theta < ORBIT.restTheta);
});

test("reset returns all three axes to the pose the room opens in", () => {
  const reset = restOrbit(ORBIT.restTheta);
  assert.equal(reset.radius, ORBIT.homeRadius);
  assert.equal(reset.phi, ORBIT.phi.rest);
  assert.equal(reset.theta, ORBIT.restTheta);

  // And it is exactly the neutral HUD state, since the reset reports itself back through the same
  // (rotationY, zoom) pair the buttons speak.
  assert.equal(controlsFromOrbit(reset).zoom, 1);
  assert.equal(controlsFromOrbit(reset).rotationY, 0);
});

test("reset takes the SHORT way home after the room has been spun round", () => {
  // theta is deliberately unbounded (see clampOrbit), so a player who has turned the room three
  // times sits at restTheta - 6π. Resetting to the literal restTheta would spin the whole diorama
  // three turns backwards, because the smoothed value chases raw in VALUE, not in angle.
  for (const turns of [-3, -1, 1, 4]) {
    const spun = ORBIT.restTheta + turns * 2 * Math.PI + 0.4;
    const reset = restOrbit(spun);
    assert.ok(
      Math.abs(reset.theta - spun) <= Math.PI,
      `reset unwound ${((reset.theta - spun) / Math.PI).toFixed(2)}π after ${turns} turns`,
    );
    // Still a rest azimuth: a whole number of turns from restTheta, so the room faces the way it opened.
    const fromRest = (reset.theta - ORBIT.restTheta) / (2 * Math.PI);
    assert.ok(Math.abs(fromRest - Math.round(fromRest)) < 1e-12);
  }
});

test("smoothing is frame-rate independent and matches the reference at 60fps", () => {
  // Two 8.33ms steps must land exactly where one 16.67ms step does.
  const one = smoothingAlpha(1 / 60);
  const half = smoothingAlpha(1 / 120);
  const twoHalves = 1 - (1 - half) * (1 - half);
  assert.ok(Math.abs(one - twoHalves) < 1e-12);

  // The reference project's factor at 60fps: 0.005/ms * 16.67ms = 0.083.
  assert.ok(Math.abs(one - 0.083) < 0.01);

  // Degenerate frames never overshoot or go backwards. (A huge dt saturates to 1.0 exactly in
  // float64 — that is convergence, not overshoot.)
  assert.equal(smoothingAlpha(0), 0);
  assert.ok(smoothingAlpha(10) <= 1);
  assert.equal(smoothingAlpha(-5), 0);
});

test("the eye orbits the target at the requested radius", () => {
  const target = { x: 0, y: 0, z: 0 };
  const angles = { radius: ORBIT.homeRadius, phi: ORBIT.phi.rest, theta: ORBIT.restTheta };
  const eye = eyeFor(target, angles);
  const distance = Math.hypot(eye.x, eye.y, eye.z);
  assert.ok(Math.abs(distance - ORBIT.homeRadius) < 1e-9);

  // At rest theta 3π/4 the camera sits in the +x / -z quadrant — outside the diorama's open
  // corner (walls are at x-min and z-max), looking in.
  assert.ok(eye.x > 0);
  assert.ok(eye.z < 0);
  // And above the floor, looking down.
  assert.ok(eye.y > 0);
});

test("the solved home radius keeps the telephoto framing", () => {
  // Regression guard: solved for the 68mm lens across the whole orbit arc (solve-orbit.mjs).
  // Anything much closer re-crops the room; anything much farther shrinks it needlessly.
  assert.ok(ORBIT.homeRadius > 9.5 && ORBIT.homeRadius < 10.5);
  assert.equal(ORBIT.focalLengthMm, 68);
});
