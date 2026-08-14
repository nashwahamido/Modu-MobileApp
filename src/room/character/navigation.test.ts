import assert from "node:assert/strict";
import test from "node:test";
import { findPath, inflateBlocked, nearestWalkable } from "./navigation";

const bounds = { w: 7, h: 7 };

test("A* routes around occupied cells", () => {
  const blocked = new Set(["3,1", "3,2", "3,3", "3,4", "3,5"]);
  const path = findPath({ x: 1, y: 3 }, { x: 5, y: 3 }, blocked, bounds);
  assert.ok(path);
  assert.deepEqual(path.at(-1), { x: 5, y: 3 });
  assert.equal(path.some((cell) => blocked.has(`${cell.x},${cell.y}`)), false);
});

test("A* reports an unreachable destination", () => {
  const blocked = new Set(["2,3", "4,3", "3,2", "3,4"]);
  assert.equal(findPath({ x: 1, y: 1 }, { x: 3, y: 3 }, blocked, bounds), null);
});

test("inflation reserves body clearance around furniture and walls", () => {
  const blocked = inflateBlocked(new Set(["3,3"]), bounds, 1);
  for (const key of ["2,2", "3,3", "4,4", "0,3", "6,3"]) assert.equal(blocked.has(key), true, key);
  assert.equal(blocked.has("1,1"), false);
});

test("nearestWalkable recovers when furniture appears under the avatar", () => {
  const blocked = new Set(["3,3", "4,3", "2,3", "3,2"]);
  assert.deepEqual(nearestWalkable({ x: 3, y: 3 }, blocked, bounds), { x: 3, y: 4 });
});
