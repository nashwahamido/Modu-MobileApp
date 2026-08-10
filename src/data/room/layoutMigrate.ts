import type { PlacedFurniture } from "../core/types";

// The migration function for saved room layouts, handling version differences. v1 floor cells (0.5m) double to v2 cells (0.25m); wall/furniture surfaces pass unchanged. Any unrecognized shape, version, or legacy bare array becomes an empty room rather than a mis-placed one.
export function migrateRoomPlacements(envelope: unknown): PlacedFurniture[] {
  // Reject non-objects, arrays (legacy bare arrays), and malformed shapes early.
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return [];

  const env = envelope as Record<string, unknown>;
  const version = env.version;
  const placements = env.placements;

  // Mirrors ShellWallId in src/room/core/roomShell.ts (the four ids the shell's wall grids are keyed by) as a local literal rather than an import, because this module stays dependency-free by design — it runs ahead of any catalog/shell wiring being ready, on whatever jsonb Supabase handed back.
  const VALID_WALL_IDS = ["x-min", "x-max", "z-min", "z-max"];

  // A row with a missing or malformed surface/cell would otherwise reach canPlace, which dereferences placement.cell.x and placement.surface.kind unconditionally and throws — one corrupt jsonb row must drop THAT row, not fail the whole room's hydrate. A wall-kind row with an unrecognized or missing `wall` is the same failure through a narrower door: surfaceExtent indexes WALL_CELLS[surface.wall] unconditionally, so it throws just as hard on "bogus" as on a missing cell.
  const hasSaneShape = (placement: Record<string, unknown>): boolean => {
    const surface = placement.surface as Record<string, unknown> | undefined;
    const cell = placement.cell as Record<string, unknown> | undefined;
    if (typeof cell?.x !== "number" || typeof cell?.y !== "number") return false;
    if (surface?.kind !== "floor" && surface?.kind !== "wall" && surface?.kind !== "furniture") return false;
    if (surface.kind === "wall" && !VALID_WALL_IDS.includes(surface.wall as string)) return false;
    return true;
  };

  // v1: floor cells double, other surfaces pass through unchanged.
  if (version === 1) {
    if (!Array.isArray(placements)) return [];
    return placements.map((p: unknown) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      const placement = p as Record<string, unknown>;
      if (!hasSaneShape(placement)) return null;
      const surface = placement.surface as Record<string, unknown>;
      // Only floor surfaces get their cell coordinates doubled; wall and furniture surfaces are unchanged.
      if (surface.kind === "floor") {
        const cell = placement.cell as Record<string, unknown>;
        return {
          ...placement,
          cell: { x: (cell.x as number) * 2, y: (cell.y as number) * 2 },
        } as unknown as PlacedFurniture;
      }
      return placement as unknown as PlacedFurniture;
    }).filter((p): p is PlacedFurniture => p !== null);
  }

  // v2: pass through unchanged, dropping any row whose surface/cell is malformed rather than shipping it downstream un-migrated.
  if (version === 2) {
    if (!Array.isArray(placements)) return [];
    return placements.filter((p): p is PlacedFurniture => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return false;
      return hasSaneShape(p as Record<string, unknown>);
    });
  }

  // Unknown version: empty room.
  return [];
}

// The room's chosen surface items, read from the SAME jsonb envelope as placements. Deliberately a separate function rather than a wider return from migrateRoomPlacements: that one returns PlacedFurniture[] and drops the rest of the envelope by design, and widening it would touch every caller for a field most of them do not want.
//
// NOT VERSIONED, and that is what makes the field free to add. migrateRoomPlacements reads only env.placements and ignores everything else, so an OLDER app build reading a row written by a newer one renders the authored look rather than failing — forward-compatible by construction, no ROOM_LAYOUT_VERSION bump, no migration.
//
// Validation against the CATALOGUE happens at the call site, not here: this module is dependency-free by design (it runs ahead of any catalog wiring being ready, on whatever jsonb Supabase handed back) and the item set is remote and mutable, so an id valid when saved can stop being valid. Here we only guarantee the SHAPE.
export type RoomFinishes = { floor?: string; wall?: string };

export function readRoomFinishes(envelope: unknown): RoomFinishes {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return {};
  const raw = (envelope as Record<string, unknown>).finishes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const source = raw as Record<string, unknown>;
  const finishes: RoomFinishes = {};
  // Per-slot, so one corrupt slot never costs the other. An empty string is dropped as hard as a number: it is not an id, and passing it on would send the loader after a texture at a path with a hole in it.
  for (const slot of ["floor", "wall"] as const) {
    const value = source[slot];
    if (typeof value === "string" && value.length > 0) finishes[slot] = value;
  }
  return finishes;
}
