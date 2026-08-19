import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { createInMemoryRepos } from "../../data/adapters/inMemory";
import { getRepos, setRepos } from "../../data/registry";
import type { GridPlacement } from "./grid";
import {
  registerPlaceables,
  useRoomCatalogStore,
} from "./placeableItems";
import { usePlacementStore } from "./placement";
import {
  CLEAR_PATH_BED_INSTANCE_ID,
  CLEAR_PATH_BED_ITEM_ID,
} from "../character/clearPathBed";

const bed: GridPlacement = {
  instanceId: CLEAR_PATH_BED_INSTANCE_ID,
  itemId: CLEAR_PATH_BED_ITEM_ID,
  variation: null,
  surface: { kind: "floor" },
  cell: { x: 1, y: 1 },
  rotSteps: 2,
};

const originalRepos = getRepos();
const originalItems = useRoomCatalogStore.getState().items;

beforeEach(() => {
  setRepos(createInMemoryRepos());
  registerPlaceables([
    {
      id: CLEAR_PATH_BED_ITEM_ID,
      source: "bought",
      category: "fur",
      size: { x: 1.495, y: 1.1, z: 2.18 },
      baseOffsetY: 0,
      mount: "floor",
    },
  ]);
  usePlacementStore.getState().reset();
});

afterEach(() => {
  usePlacementStore.getState().reset();
  useRoomCatalogStore.setState({ items: originalItems });
  setRepos(originalRepos);
});

test("switching owners clears profile-owned fixtures before hydration", async () => {
  usePlacementStore.setState({
    ownerId: "owner-a",
    reserved: [bed],
    hydrated: true,
  });

  await usePlacementStore.getState().hydrate("owner-b");

  const state = usePlacementStore.getState();
  assert.equal(state.ownerId, "owner-b");
  assert.equal(state.hydrated, true);
  assert.deepEqual(state.reserved, []);
});

test("a reserved bed uses normal editing but never leaves reserved state", () => {
  usePlacementStore.setState({
    ownerId: "owner-a",
    reserved: [bed],
    hydrated: true,
  });

  usePlacementStore.getState().editPlacement(CLEAR_PATH_BED_INSTANCE_ID);
  assert.equal(usePlacementStore.getState().activeEdit?.reserved, true);
  assert.deepEqual(usePlacementStore.getState().reserved, []);

  usePlacementStore.getState().moveGhost({ x: 3, y: 3 });
  usePlacementStore.getState().confirm();
  assert.deepEqual(usePlacementStore.getState().reserved[0]?.cell, { x: 3, y: 3 });
  assert.deepEqual(usePlacementStore.getState().layout, []);

  usePlacementStore.getState().editPlacement(CLEAR_PATH_BED_INSTANCE_ID);
  usePlacementStore.getState().moveGhost({ x: 5, y: 5 });
  usePlacementStore.getState().cancel();
  assert.deepEqual(usePlacementStore.getState().reserved[0]?.cell, { x: 3, y: 3 });

  usePlacementStore.getState().editPlacement(CLEAR_PATH_BED_INSTANCE_ID);
  usePlacementStore.getState().remove();
  assert.deepEqual(usePlacementStore.getState().reserved[0]?.cell, { x: 3, y: 3 });
});

test("entering a friend's room safely returns a bed that was being edited", () => {
  usePlacementStore.setState({
    ownerId: "owner-a",
    reserved: [bed],
    hydrated: true,
  });
  usePlacementStore.getState().editPlacement(CLEAR_PATH_BED_INSTANCE_ID);

  usePlacementStore.getState().startViewing("friend", [], {});

  const state = usePlacementStore.getState();
  assert.equal(state.activeEdit, null);
  assert.deepEqual(state.reserved, [bed]);
  assert.equal(state.viewing?.ownerId, "friend");
});
