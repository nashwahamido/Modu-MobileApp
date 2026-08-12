// The APP half of the cross-repo grid contract. Modu-Portal carries the mirror at
// packages/glb/footprintContract.test.mjs, reading a byte-identical footprintContract.json through its own
// code path. Neither repo imports the other — the portal DERIVES footprint masks and this app CONSUMES
// them, and the only thing keeping the two agreeing about what a cell is worth is this fixture failing
// loudly on whichever side drifts. See the "//" keys in footprintContract.json for why 0.25 needs a
// tripwire at all: it was duplicated five ways across the two repos and has already broken once.
//
// Deliberately routed through the PUBLIC seam (registerPlaceables -> getRoomItemDef) rather than reaching
// for the module-private cells()/sanitizedMask(). What has to match the portal is the footprint the room
// actually places against, and that is the only thing a mask is ever checked against — testing the private
// helper would prove the arithmetic agrees while leaving the wiring between it and the def untested.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { getRoomItemDef, registerPlaceables } from "./placeableItems";
import { ROOM_SHELL, TOP_CELL_SIZE } from "./roomShell";

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(resolve(here, "footprintContract.json"), "utf8")) as {
  cell: number;
  topCell: number;
  epsilon: number;
  contactBand: number;
  cells: { meters: number; cells: number; why: string }[];
  topCells: { meters: number; cells: number; why: string }[];
  mask: { id: string; sizeX: number; sizeZ: number; grid: [number, number]; mask: string };
};

// A floor row shaped like the DB seed; only the size and the mask ever vary across these cases.
const floorRow = (id: string, x: number, z: number, footprintMask?: string) => ({
  id,
  source: "bought" as const,
  category: "fur" as const,
  size: { x, y: 0.5, z },
  baseOffsetY: 0,
  mount: "floor" as const,
  ...(footprintMask ? { footprintMask } : {}),
});

test("the room's floor pitch is the contract's cell — the one number both repos must agree on", () => {
  assert.equal(ROOM_SHELL.cellSize, contract.cell);
});

test("the room's TOP pitch is the contract's topCell, and divides the floor pitch exactly", () => {
  assert.equal(TOP_CELL_SIZE, contract.topCell);
  assert.equal(ROOM_SHELL.cellSize % TOP_CELL_SIZE, 0, "a host's top extent must land on whole top cells with no remainder to round away");
});

test("every contract case claims the cell count the portal derives for the same size", () => {
  registerPlaceables(contract.cells.map(({ meters }, i) => floorRow(`case-${i}`, meters, meters)));
  contract.cells.forEach(({ meters, cells, why }, i) => {
    const def = getRoomItemDef(`case-${i}`)!;
    assert.equal(def.footprint.w, cells, `${meters} m must claim ${cells} cells across — ${why}`);
    assert.equal(def.footprint.d, cells, `${meters} m must claim ${cells} cells deep — ${why}`);
  });
});

// The end-to-end case, and the one that would actually have caught a real drift: a mask string the portal
// derived and wrote to item_buy, read back here at the grid THIS repo computes from the same authored size.
// sanitizedMask drops any mask whose dimensions disagree with the footprint and falls back to a solid rect,
// so a cell-size disagreement between the repos shows up exactly here — as a mask that silently vanishes.
test("the pinned wooden-bed mask survives sanitizedMask at the grid this repo derives", () => {
  const { id, sizeX, sizeZ, grid, mask } = contract.mask;
  registerPlaceables([floorRow(id, sizeX, sizeZ, mask)]);
  const def = getRoomItemDef(id)!;

  assert.deepEqual([def.footprint.w, def.footprint.d], grid, "this repo must derive the same grid the portal pinned");
  assert.ok(def.mask, "the mask must be ACCEPTED, not dropped for a solid rect — a dropped mask is what a cell-size drift looks like from here");
  assert.deepEqual([...def.mask], mask.split("/"), "and must survive intact, row for row");
});

// The mirror of the portal's discrimination test: proof the cases above are actually sensitive to the cell
// size. A case list that gave the same answer under a different pitch would pass in both repos while they
// disagreed — the tripwire has to be able to trip.
test("the contract cases discriminate — a different cell size would fail them", () => {
  for (const cell of [0.125, 0.5]) {
    const disagreements = contract.cells.filter(({ meters, cells }) => Math.ceil(meters / cell - contract.epsilon) !== cells);
    assert.ok(disagreements.length > 0, `a ${cell} m pitch must break at least one contract case, or the list proves nothing`);
  }
});

// The TOP grid's half of the contract, reached through def.topFootprint — what an item claims when it
// stands on another item's surface, and the grid contact_size_x/z (migration 023) exists to shrink.
test("every top-cell contract case claims what the portal derives at the finer pitch", () => {
  registerPlaceables(contract.topCells.map(({ meters }, i) => floorRow(`top-${i}`, meters, meters)));
  contract.topCells.forEach(({ meters, cells, why }, i) => {
    const def = getRoomItemDef(`top-${i}`)!;
    assert.equal(def.topFootprint.w, cells, `${meters} m must claim ${cells} top cells across — ${why}`);
    assert.equal(def.topFootprint.d, cells, `${meters} m must claim ${cells} top cells deep — ${why}`);
  });
});

// The end-to-end shape of migration 023, using the real laptop numbers the contract records: a contact
// extent narrower than the item shrinks its TOP footprint and must leave its FLOOR footprint alone. Both
// halves matter — a change that shrank the floor footprint too would let a neighbour clip the open screen.
test("a contact size shrinks the top footprint and leaves the floor footprint untouched", () => {
  registerPlaceables([
    { ...floorRow("laptop-full", 0.275, 0.356), onTop: true },
    { ...floorRow("laptop-contact", 0.275, 0.356), onTop: true, contactSize: { x: 0.236, z: 0.356 } },
  ]);
  const full = getRoomItemDef("laptop-full")!;
  const contact = getRoomItemDef("laptop-contact")!;

  assert.deepEqual([full.topFootprint.w, full.topFootprint.d], [3, 3], "the full size claims 3x3 top cells");
  assert.deepEqual([contact.topFootprint.w, contact.topFootprint.d], [2, 3], "the base claims 2x3 — a third fewer cells of the desk");
  assert.deepEqual(
    [contact.footprint.w, contact.footprint.d],
    [full.footprint.w, full.footprint.d],
    "the FLOOR footprint must be identical: a floor item's collision is its widest extent, since an overhang clips a neighbour",
  );
});

test("an absent contact size leaves the top footprint measured off the item's own size, as before 023", () => {
  registerPlaceables([{ ...floorRow("plain", 0.275, 0.356), onTop: true }]);
  const def = getRoomItemDef("plain")!;
  assert.deepEqual([def.topFootprint.w, def.topFootprint.d], [3, 3]);
});
