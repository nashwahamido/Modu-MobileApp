import { Furniture, FurnitureId, FurnitureMeta } from "@/src/game/core/type";
import { DALFRED_META } from "./DALFRED/meta";
import { LACK_META } from "./LACK/meta";
import { EKET_META } from "./EKET/meta";
import { BEKVAM_META } from "./BEKVAM/meta";
import { TUTORIAL_META } from "./TUTORIAL/meta";

/** Lightweight list for the furniture picker (no heavy payload loaded).  Entries flagged `engineOnly` (no GLB yet) are for the test harness — the  3D picker filters them out. */
export const FURNITURE_METAS: FurnitureMeta[] = [DALFRED_META, LACK_META, EKET_META, BEKVAM_META, TUTORIAL_META];

/** Lazy loaders for the full build payload. Adding a furniture = one line. */
export const FURNITURE_LOADERS: Record<FurnitureId, () => Promise<Furniture>> = {
  DALFRED: () => import("./DALFRED").then((m) => m.DALFRED),
  LACK: () => import("./LACK").then((m) => m.LACK),
  EKET: () => import("./EKET").then((m) => m.EKET),
  BEKVAM: () => import("./BEKVAM").then((m) => m.BEKVAM),
  TUTORIAL: () => import("./TUTORIAL").then((m) => m.TUTORIAL),
};

/** True when a catalogue entry has a composable, playable payload. */
export const isPlayable = (id: FurnitureId): boolean => id in FURNITURE_LOADERS;

/** Compose (and validate) a furniture's full build payload on demand. */
export const loadFurnitureById = (id: FurnitureId): Promise<Furniture> =>
  FURNITURE_LOADERS[id]();
