// deliberately dependency-free, like layoutMigrate.ts and catalog/assets.ts, so node:test imports it with plain fixtures
import type { SurfaceMap } from "../catalog/assets";
import type { SurfaceItemSpec } from "./items";

// every field is `unknown` on purpose: this is the untrusted edge, and typing it optimistically moves the lie inward
export type SurfaceRow = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// a driver or column-type change can hand `numeric` back as a string, and `Number("")` is 0 — a zero tiling scale
// which would collapse a whole floor onto one texel, so a string is accepted only when it parses finite
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

// an item_surfaces row -> the spec the renderer applies, or undefined
// UNDEFINED IS NOT AN ERROR PATH — it reads as an item with no surface data, and the caller renders the shell as authored
// nothing here throws, because one malformed row must never fail the whole catalogue fetch
// each conditional group is re-checked as a unit and dropped whole, so a bad plinth colour does not cost the floor its texture
export function parseSurfaceSpec(raw: unknown): SurfaceItemSpec | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as SurfaceRow;

  const scale = tiling(r.scale_x, r.scale_y, r.offset_x, r.offset_y);
  // tiling has no sensible default: guessing renders a floor at an arbitrary size that looks deliberate
  if (!scale) return undefined;

  // base colour is always present and so is never a column — the booleans only ADD, so an unknown map name is unrepresentable
  const maps: SurfaceMap[] = ["texture"];
  if (r.has_normal === true) maps.push("normal");
  if (r.has_rough === true) maps.push("rough");

  const spec: SurfaceItemSpec = { tiling: scale, maps };

  const edge = [r.edge_r, r.edge_g, r.edge_b].map(coerce);
  if (edge.every((c): c is number => c !== null && c >= 0 && c <= 1)) {
    spec.edgeColor = [edge[0], edge[1], edge[2]];
  }

  // all-or-nothing: without its own tiling the trim lands at the wall's scale, the extruded-wallpaper look it exists to avoid
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
