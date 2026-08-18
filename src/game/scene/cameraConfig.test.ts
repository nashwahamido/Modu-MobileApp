// The zoom floor's contract: inward scrolls stop at the floor, outward scrolls always escape it.
import assert from "node:assert/strict";
import { test } from "node:test";

import { blocksZoomIn, MIN_ORBIT_DISTANCE_M } from "./cameraConfig";

test("zooming in is blocked at the floor, zooming out never is", () => {
  const atFloor = MIN_ORBIT_DISTANCE_M - 0.01;
  assert.equal(blocksZoomIn(0.05, atFloor), true, "inward pinch at the floor must be dropped");
  assert.equal(blocksZoomIn(-0.05, atFloor), false, "outward pinch is the way back out — never block it");
  assert.equal(blocksZoomIn(0.05, 1.2), false, "inward pinch well above the floor passes through");
  assert.equal(blocksZoomIn(0.05, MIN_ORBIT_DISTANCE_M), true, "exactly at the floor counts as at the floor");
});
