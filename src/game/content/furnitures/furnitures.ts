import { Furniture, FurnitureId, FurnitureMeta } from "@/src/game/core/type";
import { DALFRED_META } from "./DALFRED/meta";
import { LACK_META } from "./LACK/meta";
import { EKET_META } from "./EKET/meta";
import { BEKVAM_META } from "./BEKVAM/meta";

/** Lightweight list for the furniture picker (no heavy payload loaded). Every entry is shown — the picker no longer hides any. */
export const FURNITURE_METAS: FurnitureMeta[] = [DALFRED_META, LACK_META, EKET_META, BEKVAM_META];

/** Lazy loaders for the full build payload. Adding a furniture = one line. */
export const FURNITURE_LOADERS: Record<FurnitureId, () => Promise<Furniture>> = {
  "dalfred-stool": () => import("./DALFRED").then((m) => m.DALFRED),
  "lack-table": () => import("./LACK").then((m) => m.LACK),
  "eket-cabinet": () => import("./EKET").then((m) => m.EKET),
  "bekvam-stool": () => import("./BEKVAM").then((m) => m.BEKVAM),
};

/** True when a catalogue entry has a composable, playable payload. */
export const isPlayable = (id: FurnitureId): boolean => id in FURNITURE_LOADERS;

/** Compose (and validate) a furniture's full build payload on demand. */
export const loadFurnitureById = (id: FurnitureId): Promise<Furniture> =>
  FURNITURE_LOADERS[id]();
