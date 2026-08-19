// Hand-authored SUB-ASSEMBLY art, one set per finish — what the build map's stage circles wear.
//
// Deliberately not in thumbs.gen.ts, for the same reason the catalogue art is not: that file is
// regenerated from the model by gen:thumbs, and an override placed there is lost on the next run.
// The assets live outside the generated tree (assets/thumbnails/clusters/) to match.
//
// The finish keys are the same strings as meta.ts's CATALOGUE_THUMBS, and they have to be: both are
// looked up by the finish that presentation/finish.ts resolves from the build's renderStyle. A key
// here with no counterpart there is simply never reached.
//
// BOTH DRAWERS TAKE THE SAME ART, exactly as the generated thumbs already do — drawerA.png and
// drawerB.png are byte-for-byte the same render, because a top drawer and a bottom drawer are the
// same object built twice. One asset per finish, referenced twice.
import type { ClusterThumbMap } from "@/src/game/core/type";

const drawers = (art: number) =>
  ({ drawerA: { light: art }, drawerB: { light: art } }) as ClusterThumbMap;

export const CLUSTER_VARIANT_THUMBS: Record<string, ClusterThumbMap> = {
  wooden: {
    cabinet: { light: require("../../../../assets/thumbnails/clusters/EKET/cabinet-wooden.png") },
    ...drawers(require("../../../../assets/thumbnails/clusters/EKET/topdrawer-wooden.png")),
  } as ClusterThumbMap,
  white: {
    cabinet: { light: require("../../../../assets/thumbnails/clusters/EKET/cabinet-white.png") },
    ...drawers(require("../../../../assets/thumbnails/clusters/EKET/topdrawer-white.png")),
  } as ClusterThumbMap,
  cozy: {
    cabinet: { light: require("../../../../assets/thumbnails/clusters/EKET/cabinet-cozy.png") },
    ...drawers(require("../../../../assets/thumbnails/clusters/EKET/topdrawer-cozy.png")),
  } as ClusterThumbMap,
  cartoon: {
    cabinet: { light: require("../../../../assets/thumbnails/clusters/EKET/cabinet-cartoon.png") },
    ...drawers(require("../../../../assets/thumbnails/clusters/EKET/topdrawer-cartoon.png")),
  } as ClusterThumbMap,
};