import { Furniture, FurnitureId, FurnitureMeta } from "@/src/game/core/type";
import { asFurnitureId } from "@/src/game/core/ids";
import { DALFRED_META } from "./DALFRED/meta";
import { LACK_META } from "./LACK/meta";
import { EKET_META } from "./EKET/meta";
import { BEKVAM_META } from "./BEKVAM/meta";

/** Lightweight list for the furniture picker (no heavy payload loaded). Every entry is shown — the picker no longer hides any. */
export const FURNITURE_METAS: FurnitureMeta[] = [DALFRED_META, LACK_META, EKET_META, BEKVAM_META];

/** The compile-time seed set. Cloud recipes extend the playable set at runtime; these four are always present. */
export const BUNDLED_FURNITURE_IDS: readonly FurnitureId[] = ["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"].map(asFurnitureId);

/** Lazy loaders for the bundled build payloads. Keyed by plain string on purpose: the id space is open now — bundled ids are a lookup hit, not the whole universe. */
export const FURNITURE_LOADERS: Record<string, () => Promise<Furniture>> = {
  "dalfred-stool": () => import("./DALFRED").then((m) => m.DALFRED),
  "lack-table": () => import("./LACK").then((m) => m.LACK),
  "eket-cabinet": () => import("./EKET").then((m) => m.EKET),
  "bekvam-stool": () => import("./BEKVAM").then((m) => m.BEKVAM),
};

/** True when the id has a BUNDLED payload. Cloud playability is decided by the loadFurniture façade, which also knows the catalog row. */
export const isBundled = (id: string): boolean => id in FURNITURE_LOADERS;

/** Compose (and validate) a bundled furniture's payload on demand. Callers that may hold a cloud id go through content/loadFurniture.ts instead. */
export const loadFurnitureById = (id: string): Promise<Furniture> => FURNITURE_LOADERS[id]();
