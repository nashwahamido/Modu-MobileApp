import assert from "node:assert/strict";
import { test } from "node:test";

import { clearSpans, convexHull, coveredSpans, type Pt } from "./gridOcclusion";

const SQUARE: Pt[] = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 20 },
  { x: 10, y: 20 },
];

test("the hull of a box's corners drops the interior points", () => {
  const hull = convexHull([...SQUARE, { x: 15, y: 15 }, { x: 12, y: 18 }]);
  assert.equal(hull.length, 4);
  for (const corner of SQUARE) {
    assert.ok(hull.some((p) => p.x === corner.x && p.y === corner.y), `missing ${corner.x},${corner.y}`);
  }
});

test("a box seen edge-on hides nothing rather than throwing", () => {
  const collinear = [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 10 },
  ];
  assert.deepEqual(convexHull(collinear), []);
  assert.deepEqual(coveredSpans({ x: 0, y: 10 }, { x: 10, y: 0 }, [convexHull(collinear)]), []);
});

test("a line crossing a square is covered over exactly the crossing", () => {
  // Horizontal through the middle, from x = 0 to x = 30: inside for x in [10, 20], i.e. t in [1/3, 2/3].
  const [span] = coveredSpans({ x: 0, y: 15 }, { x: 30, y: 15 }, [SQUARE]);
  assert.ok(Math.abs(span[0] - 1 / 3) < 1e-9);
  assert.ok(Math.abs(span[1] - 2 / 3) < 1e-9);
});

test("a line clear of every piece reports no cover and one full-length clear run", () => {
  const covered = coveredSpans({ x: 0, y: 40 }, { x: 30, y: 40 }, [SQUARE]);
  assert.deepEqual(covered, []);
  assert.deepEqual(clearSpans(covered), [[0, 1]]);
});

test("overlapping pieces merge into one span instead of stacking two dim layers", () => {
  const shifted = SQUARE.map((p) => ({ x: p.x + 5, y: p.y }));
  const covered = coveredSpans({ x: 0, y: 15 }, { x: 30, y: 15 }, [SQUARE, shifted]);
  assert.equal(covered.length, 1);
  assert.ok(Math.abs(covered[0][0] - 10 / 30) < 1e-9);
  assert.ok(Math.abs(covered[0][1] - 25 / 30) < 1e-9);
});

test("clear runs are the complement, in order, and skip zero-length gaps", () => {
  assert.deepEqual(clearSpans([[0.25, 0.5], [0.5, 0.75]]), [[0, 0.25], [0.75, 1]]);
  assert.deepEqual(clearSpans([[0, 1]]), []);
});

test("a piece the line only starts inside still clips against the near edge", () => {
  // Starts at the square's centre and runs out to the right: covered from t = 0 to the x = 20 edge.
  const [span] = coveredSpans({ x: 15, y: 15 }, { x: 35, y: 15 }, [SQUARE]);
  assert.equal(span[0], 0);
  assert.ok(Math.abs(span[1] - 0.25) < 1e-9);
});
