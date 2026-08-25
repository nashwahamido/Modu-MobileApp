import assert from "node:assert/strict";
import test from "node:test";
import { GATES } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import type { ActionId } from "@/src/game/core/type";
import { compileGate } from "./gateExpr";
import { EKET_GATE_EXPRS } from "./bundled/eketGates";

// Every action id a gate can observe: the union both sides are sensitive to. Anything outside this set cannot change either verdict.
const RELEVANT: ActionId[] = [
  "place_bottomPanel", "place_topPanel", "place_backPanel",
  "place_stabilizerRod_1", "place_stabilizerRod_2",
  ...[1, 2, 3, 4].map((i) => `tighten_dowel145572_${i}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [`tighten_cam139434_${i}`, `tighten_dowel139435_${i}`]),
] as ActionId[];

// Deterministic LCG so failures reproduce; no Math.random in tests.
function* subsets(count: number): Generator<Set<ActionId>> {
  let s = 12345;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  yield new Set<ActionId>();
  yield new Set(RELEVANT);
  for (const drop of RELEVANT) yield new Set(RELEVANT.filter((id) => id !== drop));
  for (let i = 0; i < count; i++) yield new Set(RELEVANT.filter(() => rand() < 0.5));
}

for (const name of Object.keys(GATES)) {
  test(`compiled "${name}" is behaviorally identical to the shipped closure`, () => {
    const compiled = compileGate(EKET_GATE_EXPRS[name], PARTS);
    const original = (GATES as Record<string, (done: ReadonlySet<ActionId>) => boolean>)[name];
    for (const done of subsets(2000)) assert.equal(compiled(done), original(done), `diverged on {${[...done].join(",")}}`);
  });
}

test("gate expr names must cover exactly the shipped gate names", () => {
  assert.deepEqual(Object.keys(EKET_GATE_EXPRS).sort(), Object.keys(GATES).sort());
});
