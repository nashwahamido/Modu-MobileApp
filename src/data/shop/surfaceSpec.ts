// This module is deliberately dependency-free — no supabase, no React Native, no Expo — the same reason src/data/room/layoutMigrate.ts and src/data/catalog/assets.ts stay dependency-free: so node:test can import it directly and exercise it with plain fixtures, without mocking the Supabase client that src/data/adapters/supabase.ts pulls in at import time.
import type { SurfaceMap } from "../catalog/assets";
import type { SurfaceItemSpec } from "./items";

// One public.item_surfaces row as Postgrest hands it back. Every field is `unknown` on purpose: this is the untrusted edge, and typing it optimistically here would move the lie one layer inward rather than removing it.
export type SurfaceRow = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Postgrest returns `numeric` as a JS number under default settings, but a driver or column-type change can make it a string — and `Number("")` is 0, which would silently become a zero tiling scale and collapse a whole floor onto one texel. So a string is accepted only when it parses to a finite number, and never when it is blank.
function coerce(v: unknown): number | null {
  if (typeof v === "string") return v.trim() === "" ? null : num(Number(v));
  return num(v);
}

function tiling(sx: unknown, sy: unknown, ox: unknown, oy: unknown): { scale: [number, number]; offset: [number, number] } | null {
  const x = coerce(sx);
  const y = coerce(sy);
  if (x === null || y === null || x <= 0 || y <= 0) return null;
  return { scale: [x, y], offset: [coerce(ox) ?? 0, coerce(oy) ?? 0] };
}

// Turn an item_surfaces row into the spec the renderer applies, or undefined.
//
// UNDEFINED IS NOT AN ERROR PATH — it reads exactly like an item that legitimately has no surface data, and the caller renders the shell as authored. Nothing here throws, because one malformed row must never fail the whole catalogue fetch.
//
// The DB constrains the conditional groups (edge_* all-or-none, trim scale present iff has_trim), so a conforming row cannot be half-described. This function does not assume those constraints held: the row may predate them, may have been written by a tool that bypassed them, or may arrive from the in-memory backend. Each group is therefore re-checked as a unit and dropped whole if incomplete, which is what keeps a bad plinth colour from also costing the floor its texture.
export function parseSurfaceSpec(raw: unknown): SurfaceItemSpec | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as SurfaceRow;

  const scale = tiling(r.scale_x, r.scale_y, r.offset_x, r.offset_y);
  // Tiling is the one thing with no sensible default: guessing it would render a floor at an arbitrary size that looks deliberate.
  if (!scale) return undefined;

  // Base colour is always present and so is never a column — an item without one is not an item. The booleans only ever ADD to this list, so an unknown map name is unrepresentable by construction rather than validated against a list.
  const maps: SurfaceMap[] = ["texture"];
  if (r.has_normal === true) maps.push("normal");
  if (r.has_rough === true) maps.push("rough");

  const spec: SurfaceItemSpec = { tiling: scale, maps };

  const edge = [r.edge_r, r.edge_g, r.edge_b].map(coerce);
  if (edge.every((c): c is number => c !== null && c >= 0 && c <= 1)) {
    spec.edgeColor = [edge[0], edge[1], edge[2]];
  }

  // The cornice is all-or-nothing: without its own tiling the trim maps would be applied at the wall's scale, which is exactly the extruded-strip-of-wallpaper look the separate scale exists to avoid. So a trim missing its scale is dropped entirely rather than half-applied.
  if (r.has_trim === true) {
    const trim = tiling(r.trim_scale_x, r.trim_scale_y, r.trim_offset_x, r.trim_offset_y);
    if (trim) {
      spec.trimTiling = trim;
      maps.push("trim_texture");
      if (r.has_trim_normal === true) maps.push("trim_normal");
      if (r.has_trim_rough === true) maps.push("trim_rough");
    }
  }

  return spec;
}
