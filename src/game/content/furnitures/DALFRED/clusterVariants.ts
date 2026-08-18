// Hand-authored SUB-ASSEMBLY art, one set per finish — what the build map's stage circles wear.
//
// Deliberately not in thumbs.gen.ts, for the same reason the catalogue art is not: that file is
// regenerated from the model by gen:thumbs, and an override placed there is lost on the next run.
// The assets live outside the generated tree (assets/thumbnails/clusters/) to match.
//
// The finish keys are the same strings as meta.ts's CATALOGUE_THUMBS, and they have to be: both are
// looked up by the finish that presentation/finish.ts resolves from the build's renderStyle. A key
// here with no counterpart there is simply never reached.
import type { ClusterThumbMap } from "@/src/game/core/type";

export const CLUSTER_VARIANT_THUMBS: Record<string, ClusterThumbMap> = {
  wooden: {
    base: { light: require("../../../../assets/thumbnails/clusters/DALFRED/base-wooden.png") },
    seat: { light: require("../../../../assets/thumbnails/clusters/DALFRED/seat-wooden.png") },
  } as ClusterThumbMap,
  black: {
    base: { light: require("../../../../assets/thumbnails/clusters/DALFRED/base-black.png") },
    seat: { light: require("../../../../assets/thumbnails/clusters/DALFRED/seat-black.png") },
  } as ClusterThumbMap,
  cartoon: {
    base: { light: require("../../../../assets/thumbnails/clusters/DALFRED/base-cartoon.png") },
    seat: { light: require("../../../../assets/thumbnails/clusters/DALFRED/seat-cartoon.png") },
  } as ClusterThumbMap,
  cozy: {
    base: { light: require("../../../../assets/thumbnails/clusters/DALFRED/base-cozy.png") },
    seat: { light: require("../../../../assets/thumbnails/clusters/DALFRED/seat-cozy.png") },
  } as ClusterThumbMap,
};