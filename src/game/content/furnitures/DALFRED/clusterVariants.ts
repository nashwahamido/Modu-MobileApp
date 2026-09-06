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