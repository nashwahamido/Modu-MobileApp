import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCK_TRAVEL_M,
  PRESS_BACKOFF_M,
  placeEngagement,
  pressParkInfo,
} from "./engagement";
import type { ActionId, AssemblyAction, Furniture } from "@/src/game/core/type";

const part = (partId: string, extra: object = {}) => ({
  partId,
  group: partId,
  meshName: partId,
  type: "structural",
  cluster: "box",
  pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  ...extra,
});

// Minimal keyhole pair: a placed seed side and a panel that presses onto it along +Z, then locks downward. Liaisons derive from the seed's directJoins (press kind).
const FURNITURE = {
  parts: {
    side: part("side", { seed: true, directJoins: ["panel"] }),
    panel: part("panel", { placeDir: [0, 0, 1], lockDir: [0, -1, 0] }),
    plain: part("plain", { placeDir: [0, 0, 1] }),
  },
  clusters: {},
  actions: [],
} as unknown as Furniture;

const place = (partId: string): AssemblyAction =>
  ({ actionId: `place_${partId}`, type: "placePart", stage: 1, order: 0, partId, requires: [] }) as unknown as AssemblyAction;

const DONE = new Set(["place_side"]) as unknown as ReadonlySet<ActionId>;

test("a lockDir part still engages as a plain press", () => {
  assert.equal(placeEngagement(FURNITURE, place("panel"), DONE), "press");
});

test("the keyhole park combines the press backoff and the lock leg", () => {
  const park = pressParkInfo(FURNITURE, place("panel"), DONE);
  assert.ok(park);
  assert.deepEqual(park!.axis, [0, 0, 1]);
  // combined offset: backed off along −placeDir AND raised opposite the downward lock
  assert.deepEqual(park!.offset, [0, LOCK_TRAVEL_M, -PRESS_BACKOFF_M]);
  assert.ok(park!.lock);
  assert.deepEqual(park!.lock!.axis, [0, -1, 0]);
  assert.deepEqual(park!.lock!.offset, [0, LOCK_TRAVEL_M, 0]);
});

test("a part without lockDir gets no lock leg", () => {
  const f = {
    ...FURNITURE,
    parts: { ...(FURNITURE as unknown as { parts: object }).parts, side: part("side", { seed: true, directJoins: ["plain"] }) },
  } as unknown as Furniture;
  const park = pressParkInfo(f, place("plain"), DONE);
  assert.ok(park);
  assert.equal(park!.lock, undefined);
  assert.deepEqual(park!.offset, [0, 0, -PRESS_BACKOFF_M]);
});

test("authored lockTravel overrides the default lock leg length", () => {
  const f = {
    ...FURNITURE,
    parts: {
      side: part("side", { seed: true, directJoins: ["panel"] }),
      panel: part("panel", { placeDir: [0, 0, 1], lockDir: [0, -1, 0], lockTravel: 0.02 }),
    },
  } as unknown as Furniture;
  const park = pressParkInfo(f, place("panel"), DONE);
  assert.deepEqual(park!.lock!.offset, [0, 0.02, 0]);
});
