import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { GridPlacement } from "@/src/room/core/grid";
import { canPlaceInLayout } from "@/src/room/core/grid";
import { registerPlaceables, roomItemDefs } from "@/src/room/core/placeableItems";
import { ROOM_LAYOUT_VERSION } from "../core/types";
import { STARTER_ROOM_ITEM_IDS, createStarterRoomPlacements } from "./initialLayout";

// window-wood-classic is copied from 010; sofa-modular's extent and mask are what 015 measured (8x6 quarter-cells)
// painting-nature is portal-published with no row here, so its size stands in for a small hung frame
// so this checks the AUTHORED CELLS are legal for pieces of about this size, not that the art is exactly this big
const starterRows = [
  { id: "window-wood-classic", source: "bought" as const, category: "win" as const, size: { x: 1.239, y: 1.231, z: 0.349 }, baseOffsetY: 0, mount: "wall" as const, opensWall: true },
  { id: "painting-nature", source: "bought" as const, category: "deco" as const, size: { x: 0.8, y: 0.6, z: 0.05 }, baseOffsetY: 0, mount: "wall" as const },
  { id: "sofa-modular", source: "bought" as const, category: "fur" as const, size: { x: 1.9, y: 0.75, z: 1.275 }, baseOffsetY: 0, mount: "floor" as const, footprintMask: "XXXXXXXX/XXXXXXXX/XXXXXXXX/.....XXX/.....XXX/.....XX." },
];

const toGrid = (placement: ReturnType<typeof createStarterRoomPlacements>[number]): GridPlacement => ({
  instanceId: placement.instanceId,
  itemId: placement.furnitureId,
  variation: placement.color ?? null,
  surface: placement.surface,
  cell: placement.cell,
  rotSteps: placement.rotSteps,
});

test("starter room placements fit the room without colliding", () => {
  registerPlaceables(starterRows);
  const accepted: GridPlacement[] = [];

  for (const placement of createStarterRoomPlacements().map(toGrid)) {
    assert.deepEqual(canPlaceInLayout(placement, accepted, roomItemDefs()), { ok: true }, placement.instanceId);
    accepted.push(placement);
  }
});

test("starter inventory covers every item placed in the starter room", () => {
  assert.deepEqual(
    new Set(createStarterRoomPlacements().map((placement) => placement.furnitureId)),
    new Set(STARTER_ROOM_ITEM_IDS),
  );
});

// provisioning happens in the DATABASE, so a new account gets 028's trigger rows — the TS copy is for the fixture
// nothing but this test keeps the two agreeing, and the drift is silent
// bump ROOM_LAYOUT_VERSION and the migration's hardcoded `'version', 2` is an empty room for every new player
const MIGRATION = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/028_initial_room_layout.sql");

// a parser, not a regex per field — a regex stays quiet about a field added on one side
function parseJsonbLiteral(sql: string, start: number): { value: unknown; end: number } {
  let i = start;
  const skipSpace = () => { while (i < sql.length && /\s/.test(sql[i]!)) i += 1; };

  const parseArgs = (): unknown[] => {
    const args: unknown[] = [];
    i += 1; // the opening paren
    skipSpace();
    if (sql[i] === ")") return (i += 1, args);
    for (;;) {
      const arg = parseJsonbLiteral(sql, i);
      args.push(arg.value);
      i = arg.end;
      skipSpace();
      if (sql[i] === ",") { i += 1; continue; }
      assert.equal(sql[i], ")", `expected , or ) at offset ${i}`);
      i += 1;
      return args;
    }
  };

  skipSpace();
  if (sql.startsWith("jsonb_build_object", i)) {
    i += "jsonb_build_object".length;
    skipSpace();
    const args = parseArgs();
    assert.equal(args.length % 2, 0, "jsonb_build_object takes key/value pairs");
    const object: Record<string, unknown> = {};
    for (let pair = 0; pair < args.length; pair += 2) object[String(args[pair])] = args[pair + 1];
    return { value: object, end: i };
  }
  if (sql.startsWith("jsonb_build_array", i)) {
    i += "jsonb_build_array".length;
    skipSpace();
    return { value: parseArgs(), end: i };
  }
  if (sql[i] === "'") {
    i += 1;
    let text = "";
    for (;;) {
      assert.notEqual(i, sql.length, "unterminated string literal");
      if (sql[i] === "'") {
        // '' inside a literal is an escaped quote, not the end of the string
        if (sql[i + 1] !== "'") return (i += 1, { value: text, end: i });
        text += "'";
        i += 2;
        continue;
      }
      text += sql[i];
      i += 1;
    }
  }
  const number = /^-?\d+(\.\d+)?/.exec(sql.slice(i));
  assert.ok(number, `unparseable jsonb expression at offset ${i}: ${sql.slice(i, i + 40)}`);
  return { value: Number(number[0]), end: i + number[0].length };
}

function migrationSql(): string {
  return readFileSync(MIGRATION, "utf8");
}

// the body between the initial_room_layout() header and its closing $$, so a later function is never parsed
function initialRoomLayoutBody(sql: string): string {
  const header = sql.indexOf("create or replace function public.initial_room_layout()");
  assert.notEqual(header, -1, "migration 028 no longer defines initial_room_layout()");
  const open = sql.indexOf("as $$", header);
  const close = sql.indexOf("$$;", open);
  assert.ok(open !== -1 && close !== -1, "initial_room_layout() body is not $$-quoted");
  return sql.slice(open + "as $$".length, close);
}

test("the migration provisions exactly the layout this module describes", () => {
  const body = initialRoomLayoutBody(migrationSql());
  const select = body.indexOf("select");
  assert.notEqual(select, -1, "initial_room_layout() no longer selects a literal");

  const { value } = parseJsonbLiteral(body, select + "select".length);

  assert.deepEqual(value, {
    version: ROOM_LAYOUT_VERSION,
    // through JSON, so an optional TS field left undefined is absent as it is in jsonb
    placements: JSON.parse(JSON.stringify(createStarterRoomPlacements())),
  });
});

test("the migration grants exactly the starter items", () => {
  const sql = migrationSql();
  const values = /from \(values (.*?)\) as starter\(item_id\)/s.exec(sql);
  assert.ok(values, "migration 028 no longer grants its starter items from a values list");

  const granted = [...values[1]!.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1]!.replace(/''/g, "'"));
  assert.deepEqual(new Set(granted), new Set(STARTER_ROOM_ITEM_IDS));
  assert.equal(granted.length, STARTER_ROOM_ITEM_IDS.length, "an item is granted twice");
});
