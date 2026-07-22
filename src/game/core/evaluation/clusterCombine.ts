import type { ClusterDef, ClusterId, Vec3 } from "@/src/game/core/type";
import type { ParkInfo } from "./engagement";

type Clusters = Record<ClusterId, ClusterDef> | undefined;

/** How far a slide-joined cluster (or a sliding part) parks off its seat before the drive gesture, in meters; a slide travels further than a press (PRESS_BACKOFF_M, in engagement). Lives here, the leaf module, so engagement can depend on it without a require cycle. */
export const SLIDE_BACKOFF_M = 0.1;

/** The clusters that must already be combined before `id` can be: its authored slideJoins. The root's list is empty. */
export function combinePrereqClusters(clusters: Clusters, id: ClusterId): ClusterId[] {
  return [...(clusters?.[id]?.slideJoins ?? [])];
}

/** How this cluster meets the assembly: the seed drops into place, a slide-joined cluster travels along its authored axis (screwing in when it authors driveMotion "screw"). Null when the cluster authors neither — the caller then keeps the legacy crossClusterThreads behaviour. */
export function clusterCombineEngagement(
  clusters: Clusters,
  id: ClusterId,
): "drop" | "slide" | "screw" | null {
  const c = clusters?.[id];
  if (!c) return null;
  if (c.slideJoins?.length) return c.driveMotion === "screw" ? "screw" : "slide";
  if (c.seed) return "drop";
  return null;
}

/** The drive gesture a slide-joined cluster hands off to at its park: the straight glide or the screw dial. */
export function clusterDriveKind(clusters: Clusters, id: ClusterId): "slide" | "screw" {
  return clusters?.[id]?.driveMotion === "screw" ? "screw" : "slide";
}

const unit = (v: Vec3): Vec3 | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-6 ? null : [v[0] / l, v[1] / l, v[2] / l];
};

/** Where a slide-joined cluster parks before its drive gesture: backed off along its own travel axis by the authored backoff. Null for the seed (it drops, no staging) and for any cluster missing a usable placeDir. */
export function clusterParkInfo(clusters: Clusters, id: ClusterId): ParkInfo | null {
  const c = clusters?.[id];
  if (!c?.slideJoins?.length || !c.placeDir) return null;
  const axis = unit(c.placeDir);
  if (!axis) return null;
  const backoff = c.parkBackoff ?? SLIDE_BACKOFF_M;
  return {
    axis,
    offset: [-axis[0] * backoff || 0, -axis[1] * backoff || 0, -axis[2] * backoff || 0],
  };
}
