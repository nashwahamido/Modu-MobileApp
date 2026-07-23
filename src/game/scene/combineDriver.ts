import type { ClusterDriver } from "./offsetDriver";

type Float3 = [number, number, number];

/** The minimum a drive gesture needs of whatever it is moving. OffsetDriver and ClusterDriver both satisfy it, which is what lets SlideControl drive a single part or a whole cluster through one code path. */
export interface OffsetSink {
  set(offset: Float3): void;
  readonly value: Float3;
}

/** A cluster combines as ONE rigid group — the runners stay put during a combine (they only telescope in the test beats) — so its sink is a plain ClusterDriver. */
export function clusterSink(driver: ClusterDriver): OffsetSink {
  return driver;
}
