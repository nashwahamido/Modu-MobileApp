import type { ClusterDriver } from "./offsetDriver";

type Float3 = [number, number, number];

export interface OffsetSink {
  set(offset: Float3): void;
  readonly value: Float3;
}

export function clusterSink(driver: ClusterDriver): OffsetSink {
  return driver;
}
