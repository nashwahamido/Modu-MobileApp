import test from "node:test";
import assert from "node:assert/strict";

import { applyBuild } from "./buildSave";
import { useGameStore } from "./store";
import type { AssemblyMode, Furniture } from "./type";
import type { BuildSave } from "@/src/data/core/types";
import { EKET_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";

// The fixtures deliberately carry a bare meta (`{ id }`), so each case states the pin it is testing rather than inheriting one.
const pinned = (mode?: AssemblyMode): Furniture => ({
  ...EKET_FIXTURE,
  meta: { ...EKET_FIXTURE.meta, mode },
});

const savedIn = (mode: AssemblyMode): BuildSave => ({
  ownerId: "builder-1",
  furnitureId: EKET_FIXTURE.meta.id,
  completed: [],
  tightenDeg: {},
  orientationDeg: {},
  driveProgress: {},
  mode,
  updatedAt: "2026-08-24T00:00:00.000Z",
});

test("a furniture's meta.mode is the mode its build opens in, over the player's", () => {
  useGameStore.setState({ mode: "free" });
  useGameStore.getState().loadFurniture(pinned("guide"));
  assert.equal(useGameStore.getState().mode, "guide");
});

test("a furniture with no meta.mode leaves the player's mode exactly as it was", () => {
  useGameStore.setState({ mode: "free" });
  useGameStore.getState().loadFurniture(pinned(undefined));
  assert.equal(useGameStore.getState().mode, "free");
});

// The whole point of calling meta.mode a DEFAULT: it is the mode a build OPENS in, and a save means this build has been opened before. So the save wins, unconditionally — the pin is a first-entry nudge, not a property of the furniture. applyBuild running after loadFurniture is what makes that true; break the ordering and the pin turns into a lock.
test("a resumed build restores its save's mode, not the furniture's default", () => {
  useGameStore.setState({ mode: "guide" });
  useGameStore.getState().loadFurniture(pinned("guide"));
  applyBuild(savedIn("free"));
  assert.equal(useGameStore.getState().mode, "free");
});

test("an unpinned furniture also resumes in its save's mode", () => {
  useGameStore.setState({ mode: "free" });
  useGameStore.getState().loadFurniture(pinned(undefined));
  applyBuild(savedIn("guide"));
  assert.equal(useGameStore.getState().mode, "guide");
});

test("the settings panel can still switch mode after a pinned furniture loads", () => {
  useGameStore.setState({ mode: "free" });
  useGameStore.getState().loadFurniture(pinned("guide"));
  useGameStore.getState().setMode("free");
  assert.equal(useGameStore.getState().mode, "free");
});
