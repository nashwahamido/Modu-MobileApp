import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  denormalizePlacementPoint,
  getRoomFloorPoint,
  getPlacementIssue,
  getPlacementPerspectiveScale,
  normalizePlacementPoint,
} from './placementConstraints';

const viewport = { width: 1200, height: 800 };
const footprint = { width: 0.08, depth: 0.05 };

test('placement coordinates survive viewport normalization', () => {
  const original = { x: 840, y: 640 };
  const normalized = normalizePlacementPoint(original, viewport.width, viewport.height);

  assert.deepEqual(normalized, { x: 0.7, y: 0.8 });
  assert.deepEqual(
    denormalizePlacementPoint(normalized, viewport.width, viewport.height),
    original,
  );
});

test('perspective scale is clamped at the near and far limits', () => {
  assert.equal(getPlacementPerspectiveScale(0, viewport.height), 0.55);
  assert.equal(getPlacementPerspectiveScale(viewport.height, viewport.height), 1.18);
});

test('furniture origin is raised by half its height to sit on the room floor', () => {
  const floorPoint = getRoomFloorPoint({ x: 0.5, y: 0.62 }, 0.2);

  assert.deepEqual(floorPoint, { x: 0, y: -0.4, z: 0 });
});

test('placement accepts a clear floor position', () => {
  const issue = getPlacementIssue(
    { x: viewport.width * 0.74, y: viewport.height * 0.82 },
    viewport.width,
    viewport.height,
    1,
    footprint,
  );

  assert.equal(issue, null);
});

test('placement rejects positions outside the empty room floor', () => {
  const outsideIssue = getPlacementIssue(
    { x: viewport.width * 0.1, y: viewport.height * 0.2 },
    viewport.width,
    viewport.height,
    1,
    footprint,
  );
  const formerObstacleIssue = getPlacementIssue(
    { x: viewport.width * 0.6, y: viewport.height * 0.6 },
    viewport.width,
    viewport.height,
    1,
    footprint,
  );

  assert.equal(outsideIssue, 'Keep the furniture on the room floor.');
  assert.equal(formerObstacleIssue, null);
});

test('placement rejects overlap with furniture already in the room', () => {
  const occupiedIssue = getPlacementIssue(
    { x: viewport.width * 0.6, y: viewport.height * 0.6 },
    viewport.width,
    viewport.height,
    1,
    footprint,
    [{ left: 0.55, right: 0.65, top: 0.55, bottom: 0.65 }],
  );

  assert.equal(occupiedIssue, 'That spot is occupied. Try another place.');
});
