import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORBIT,
  clampOrbit,
  controlsFromOrbit,
  eyeFor,
  orbitFromControls,
  smoothingAlpha,
} from "./orbit";
import { MAX_ROOM_YAW } from "../core/roomShell";

test("orbit clamps to the diorama's readable arc on every axis", () => {
  const wild = clampOrbit({ radius: 999, phi: 9, theta: 99 });
  assert.equal(wild.radius, ORBIT.homeRadius / ORBIT.zoom.min);
  assert.equal(wild.phi, ORBIT.phi.max);
  assert.equal(wild.theta, ORBIT.restTheta + MAX_ROOM_YAW);

  const tight = clampOrbit({ radius: 0, phi: 0, theta: -99 });
  assert.equal(tight.radius, ORBIT.homeRadius / ORBIT.zoom.max);
  assert.equal(tight.phi, ORBIT.phi.min);
  assert.equal(tight.theta, ORBIT.restTheta - MAX_ROOM_YAW);
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
