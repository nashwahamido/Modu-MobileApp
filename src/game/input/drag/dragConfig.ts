// Every tunable the part drag runs on, in one place — the gesture's own feel.
// The pure-maths constants (aim-band cap, drift cap, carry clearance) stay in dragPlane.ts, next to the functions that consume them.

// --------------- pickup
export const PICKUP_MS = 250; // long-press before a tray card gives up its part
export const FINGER_LIFT_DP = 22; // the held part rides above the fingertip, so the finger doesn't cover it

// --------------- targeting
export const APPROACH_RADIUS_M = 0.3; // ghost/magnet targeting starts here, before the snap threshold

// position is decoupled from rotation: rotation eases in over the whole approach, position stays under the finger until this close
// caps finger→part drift at ~3cm — pulling from snapDist (14-19cm) felt uncontrollable
export const POS_PULL_START_M = 0.09;
export const POS_PULL_FULL_M = 0.025;

export const SWITCH_MARGIN_PX = 14; // anti-flicker between equivalent sockets, in SCREEN px — candidates match on projected positions

// acceptance radius is settings.snapDistance (per-profile, default 0.14); these clamp it to the geometry-safe range
export const SNAP_DIST_MIN = 0.06;
export const SNAP_DIST_MAX = 0.2;

// how far past the screen edge an ALREADY-matched socket keeps its match
// acquisition needs the socket in frame — a snap must not be earnable against a hole the player can't see — but release is lenient, so a mid-drag orbit doesn't pop the magnet
export const HOLD_OFFSCREEN_MARGIN_PX = 96;

// --------------- socket-depth blend
export const DEPTH_BLEND_ENABLED = false; // OFF while we A/B the drag: the part holds its carry depth until the position magnet takes over, so delivery is posT's job alone

// per-frame ease. Lower = more lag between aim and depth, which is what stops the depth racing the finger
// 0.12 is ~130ms at 60fps against the ~90ms the finger spends crossing the band; raise toward 0.25 if delivery feels sluggish, lower if the part still swings
export const DEPTH_BLEND_EASE = 0.12;
export const DEPTH_BLEND_EPS = 0.002; // weight below which the blend counts as fully out

// --------------- carry depth cap
export const CARRY_CAP_ENABLED = true; // OFF restores the uncapped socket-referenced carry, where dragging across the furniture puts the held part behind it
export const CARRY_SURFACE_MARGIN_M = 0.02; // visible gap in FRONT of the capping surface — boxes already outsize their meshes, so this is anti-z-fighting, not safety

// per-frame ease. The raw cap is a STEP function of screen position — crossing a panel's silhouette flips the first surface to open background in one frame — so taking it outright pops the part's size at every edge
// faster than DEPTH_BLEND_EASE (~75ms) because the failure it eases into is the part vanishing behind geometry, and lag there is spent invisible
export const CARRY_CAP_EASE = 0.2;
export const CARRY_CAP_EPS_M = 0.002; // an exponential ease never arrives, so the cap retires to Infinity within this of its target — 2mm is under anything in these builds

// --------------- occluders
// how often the occluder box list is re-read DURING a drag. Camera motion never stales it (boxes are world-space), but parts MOVING do: a cluster-focus toggle, or the previous part's commit still easing home
export const OCCLUDER_REFRESH_MS = 300;
