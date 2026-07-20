// tools/processGLB/test/answer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAnswers } from "../lib/answer.mjs";

test("resolveAnswers falls back to defaults and resolves custom", () => {
  const qs = [
    { id: "q1", options: [{ key: "a", value: "x" }, { key: "b", value: "y" }], default: "a" },
    { id: "q2", options: [{ key: "a", value: "__custom__" }], default: "a" },
  ];
  const r = resolveAnswers(qs, { q1: "b", "q2:custom": "myName" });
  assert.equal(r.get("q1"), "y");
  assert.equal(r.get("q2"), "myName");
});
