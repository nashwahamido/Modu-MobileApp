import assert from "node:assert/strict";
import test from "node:test";

import { workshopDraftsDevGateOpen } from "./workshopDraftsGate";

test("workshopDraftsDevGateOpen is true only with __DEV__, the supabase backend, and showcase off", () => {
  assert.equal(workshopDraftsDevGateOpen(true, "supabase", undefined), true);
  assert.equal(workshopDraftsDevGateOpen(true, "supabase", "0"), true);
});

test("workshopDraftsDevGateOpen is false outside __DEV__ — a release build never opens it, whatever the env looks like", () => {
  assert.equal(workshopDraftsDevGateOpen(false, "supabase", undefined), false);
});

test("workshopDraftsDevGateOpen is false against the in-memory backend — no workshop_drafts table to read", () => {
  assert.equal(workshopDraftsDevGateOpen(true, "memory", undefined), false);
  assert.equal(workshopDraftsDevGateOpen(true, undefined, undefined), false);
});

test("workshopDraftsDevGateOpen is false in a showcase build — the switch devAccounts.ts documents as mutually exclusive with the dev roster", () => {
  assert.equal(workshopDraftsDevGateOpen(true, "supabase", "1"), false);
});
