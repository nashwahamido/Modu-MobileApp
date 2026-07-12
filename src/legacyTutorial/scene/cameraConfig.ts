/**
 * Explicit lens setting shared by the render camera and the gesture layer's
 * screen→world unprojection — both must agree or held parts drift off the
 * finger. 28mm is react-native-filament's default 35mm-equivalent lens.
 */
export const FOCAL_LENGTH_MM = 28;

/** Full vertical field of view: filament derives it from a 24mm sensor height. */
export const FOV_Y_DEG = (2 * Math.atan(12 / FOCAL_LENGTH_MM) * 180) / Math.PI;
