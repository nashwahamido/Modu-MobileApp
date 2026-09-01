export const FOCAL_LENGTH_MM = 28;

export const FOV_Y_DEG = (2 * Math.atan(12 / FOCAL_LENGTH_MM) * 180) / Math.PI;

export const CAMERA_NEAR_M = 0.1;

export const MIN_ORBIT_DISTANCE_M = 0.65;

export function blocksZoomIn(scaleDelta: number, eyeDistM: number): boolean {
  return scaleDelta > 0 && eyeDistM <= MIN_ORBIT_DISTANCE_M;
}
