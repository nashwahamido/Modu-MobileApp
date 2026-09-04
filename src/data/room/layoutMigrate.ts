import type { PlacedFurniture } from "../core/types";

// migrates saved layouts across versions — v1 floor cells (0.5m) double to v2 (0.25m), other surfaces pass unchanged
// an unrecognised shape, version or legacy bare array becomes an empty room, not a mis-placed one
export function migrateRoomPlacements(envelope: unknown): PlacedFurniture[] {
  // reject non-objects, arrays (the legacy bare form) and malformed shapes early
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return [];

  const env = envelope as Record<string, unknown>;
  const version = env.version;
  const placements = env.placements;

  // ShellWallId (room/core/roomShell.ts) inlined, not imported — this module stays dependency-free by design
  const VALID_WALL_IDS = ["x-min", "x-max", "z-min", "z-max"];

  // canPlace dereferences placement.cell.x and surface.kind unconditionally, so a corrupt row must drop alone
  // a bogus `wall` is the same failure — surfaceExtent indexes WALL_CELLS[surface.wall] just as unconditionally
  const hasSaneShape = (placement: Record<string, unknown>): boolean => {
    const surface = placement.surface as Record<string, unknown> | undefined;
    const cell = placement.cell as Record<string, unknown> | undefined;
    if (typeof cell?.x !== "number" || typeof cell?.y !== "number") return false;
    if (surface?.kind !== "floor" && surface?.kind !== "wall" && surface?.kind !== "furniture") return false;
    if (surface.kind === "wall" && !VALID_WALL_IDS.includes(surface.wall as string)) return false;
    return true;
  };

  // v1: floor cells double, other surfaces pass through unchanged
  if (version === 1) {
    if (!Array.isArray(placements)) return [];
    return placements.map((p: unknown) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      const placement = p as Record<string, unknown>;
      if (!hasSaneShape(placement)) return null;
      const surface = placement.surface as Record<string, unknown>;
      // only floor surfaces get their cells doubled; wall and furniture surfaces are unchanged
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

  // v2: pass through, dropping a malformed surface/cell rather than shipping it downstream
  if (version === 2) {
    if (!Array.isArray(placements)) return [];
    return placements.filter((p): p is PlacedFurniture => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return false;
      return hasSaneShape(p as Record<string, unknown>);
    });
  }

  // unknown version: empty room
  return [];
}

// the room's chosen surface items, off the same envelope as placements — separate, so migrateRoomPlacements keeps its return
// not versioned, which made the field free to add: an older build reads only env.placements and renders the authored look
// validation against the catalogue happens at the call site — this module guarantees only the shape
export type RoomFinishes = { floor?: string; wall?: string };

export function readRoomFinishes(envelope: unknown): RoomFinishes {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return {};
  const raw = (envelope as Record<string, unknown>).finishes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const source = raw as Record<string, unknown>;
  const finishes: RoomFinishes = {};
  // per-slot, so one corrupt slot never costs the other; an empty string is no id at all
  for (const slot of ["floor", "wall"] as const) {
    const value = source[slot];
    if (typeof value === "string" && value.length > 0) finishes[slot] = value;
  }
  return finishes;
}
