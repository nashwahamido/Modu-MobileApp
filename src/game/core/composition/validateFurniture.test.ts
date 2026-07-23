import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterOverlayIssues } from "./validateFurniture";
import type { ClusterDef, ClusterId } from "@/src/game/core/type";

const messages = (cs: unknown, push?: unknown) =>
  clusterOverlayIssues(cs as Record<ClusterId, ClusterDef>, push as never).map((i) => i.message);

test("two seeds is an error", () => {
  const out = messages({
    a: { id: "a", label: "A", seed: true },
    b: { id: "b", label: "B", seed: true },
  });
  assert.ok(out.some((m) => m.includes("exactly one")));
});

test("a seed that also slideJoins is an error", () => {
  const out = messages({
    a: { id: "a", label: "A", seed: true, slideJoins: ["b"], placeDir: [1, 0, 0] },
    b: { id: "b", label: "B" },
  });
  assert.ok(out.some((m) => m.includes("is a seed and also slideJoins")));
});

test("slideJoins naming an unknown cluster is an error", () => {
  const out = messages({
    a: { id: "a", label: "A", seed: true },
    b: { id: "b", label: "B", slideJoins: ["nope"], placeDir: [1, 0, 0] },
  });
  assert.ok(out.some((m) => m.includes('unknown cluster "nope"')));
});

test("a cycle in slideJoins is an error", () => {
  const out = messages({
    a: { id: "a", label: "A", slideJoins: ["b"], placeDir: [1, 0, 0] },
    b: { id: "b", label: "B", slideJoins: ["a"], placeDir: [1, 0, 0] },
  });
  assert.ok(out.some((m) => m.includes("cycle")));
});

test("a slide-joined cluster without a usable placeDir is an error", () => {
  const out = messages({
    a: { id: "a", label: "A", seed: true },
    b: { id: "b", label: "B", slideJoins: ["a"] },
  });
  assert.ok(out.some((m) => m.includes("placeDir")));
});

// (the pushLevel-vs-PUSH_OPEN check died with ClusterDef.pushLevel in the testActionIds redesign)
test("a clean overlay yields no issues", () => {
  const out = messages(
    {
      a: { id: "a", label: "A", seed: true },
      b: { id: "b", label: "B", slideJoins: ["a"], placeDir: [1, 0, 0] },
    },
    { axis: [-1, 0, 0], distance: 0.1, testActionIds: { "1": "x" }, groups: [{ level: "1", ratio: 1, parts: [] }] },
  );
  assert.deepEqual(out, []);
});

test("no overlay yields no issues", () => {
  assert.deepEqual(messages({ a: { id: "a", label: "A" }, b: { id: "b", label: "B" } }), []);
});
