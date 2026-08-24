import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTrayCard } from "./trayCard";
import type { AssemblyAction, Furniture } from "@/src/game/core/type";

const F = {
  parts: {
    sideL: { partId: "sideL", group: "side", type: "panel" },
    dowel: { partId: "dowel", group: "dowel", type: "fastener", insertStage: [0, 0.05, 0] },
    carrier: { partId: "carrier", group: "drawer", type: "panel", stageOffset: [0, 0.2, 0] },
    bodyB: { partId: "bodyB", group: "runner", type: "panel" },
  },
  components: {
    byBody: { bodyB: "runnerPair" },
    lead: { runnerPair: "bodyA" },
    label: {},
  },
} as unknown as Furniture;

const act = (actionId: string, type: string, partId: string): AssemblyAction =>
  ({ actionId, type, partId }) as unknown as AssemblyAction;

test("a plain pickup earns a card", () => {
  assert.equal(hasTrayCard(F, act("p1", "placePart", "sideL")), true);
});

test("a tighten is an on-canvas gesture and earns no card", () => {
  assert.equal(hasTrayCard(F, act("t1", "tightenFastener", "sideL")), false);
});

test("a 3-phase insert on a staged fastener is a press gesture and earns no card", () => {
  assert.equal(hasTrayCard(F, act("i1", "insertFastener", "dowel")), false);
});

test("a staged carrier's seating placePart earns no card even though it is a pickup type", () => {
  assert.equal(hasTrayCard(F, act("p2", "placePart", "carrier")), false);
});

test("a staged carrier's stagePart — taking it out of the box — does earn a card", () => {
  assert.equal(hasTrayCard(F, act("s1", "stagePart", "carrier")), true);
});

test("a non-lead component body hides behind its lead's card", () => {
  assert.equal(hasTrayCard(F, act("p3", "placePart", "bodyB")), false);
});

test("an action with no partId earns no card", () => {
  assert.equal(
    hasTrayCard(F, { actionId: "c1", type: "combineClusters" } as unknown as AssemblyAction),
    false,
  );
});
