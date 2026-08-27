// Every tunable the part drag runs on, in one place. They were scattered through the top of usePartDrag, which made "what would I turn to change how this feels" a reading exercise. The geometry constants that belong to the pure maths (aim-band cap, drift cap, carry clearance) stay in dragPlane.ts next to the functions that consume them; what lives here is the gesture's own feel.

/** Long-press duration before a tray card gives up its part. */
export const PICKUP_MS = 450;
/** The held part rides just above the fingertip so the finger doesn't cover it. */
export const FINGER_LIFT_DP = 22;
/** Ghost/magnet targeting starts before the final snap threshold. */
export const APPROACH_RADIUS_M = 0.3;
/** Magnetic POSITION pull band, decoupled from rotation: rotation eases in over the whole approach (0.3m), but position stays under the finger until this close and is fully seated at POS_PULL_FULL_M — capping finger→part drift at ~3cm (it used to reach snapDist, 14–19cm, which felt uncontrollable). */
export const POS_PULL_START_M = 0.09;
export const POS_PULL_FULL_M = 0.025;
/** Per-frame ease for the socket-depth blend, and the weight below which it is treated as fully out. Lower = more lag between the aim and the depth, which is what stops the depth racing the finger; 0.12 is roughly a 130 ms time constant at 60 fps, against the ~90 ms the finger spends crossing the band at a typical drag speed. Device-tunable: raise it toward the 0.25 the work plane uses if delivery starts to feel sluggish, lower it if the part still swings. */
export const DEPTH_BLEND_EASE = 0.12;
export const DEPTH_BLEND_EPS = 0.002;
/** Master switch for the socket-depth blend. OFF while we A/B the drag: with it off the part holds its carry depth right up until the position magnet takes over, so delivery is posT's job alone. Flip to true to restore the eased approach. */
export const DEPTH_BLEND_ENABLED = false;
/** Prevent target flicker when hovering between equivalent sockets — expressed in SCREEN pixels because candidate matching is done on the projected screen positions (the finger's aim is 2D; depth must never hide a socket). */
export const SWITCH_MARGIN_PX = 14;
/** Snap ACCEPTANCE radius comes from settings.snapDistance (per-profile, default 0.14); clamped here so no profile can exceed the geometry-safe cap. APPROACH/SWITCH_MARGIN above stay constants — they own anti-jumping. */
export const SNAP_DIST_MIN = 0.06;
export const SNAP_DIST_MAX = 0.2;
/** How far past the screen edge an ALREADY-matched socket keeps its match. Acquisition needs the socket in frame (a snap must not be earnable against a hole the player can't see); release is this much more lenient so a mid-drag orbit that nudges the socket over the edge doesn't pop the magnet mid-pull. */
export const HOLD_OFFSCREEN_MARGIN_PX = 96;
/** Master switch for the socket VISIBILITY gate: the sightline rule in usePartDrag that refuses to acquire a socket the camera cannot see, its clearPoints second chance, and the renderer second opinion behind it (pickConfirm). OFF — the rule was correct about what is visible and still cost more than it paid: it made turning the camera a PRECONDITION of placing a part, so an aim that was already on the right hole did nothing until the player orbited, and the block read as a dead magnet rather than as a rule. With it off a socket is acquired on the finger's aim alone, whether or not a placed part stands in front of it. Everything the gate needs is left in place (burials are still measured, the confirmer still registered) so flipping this back is the only step to restore it. Note this does NOT lift the off-frame skip: a socket outside the viewport is still not acquirable, because it has no screen position to aim at. */
export const SOCKET_VISIBILITY_GATE_ENABLED = false;
/** Master switch for the occlusion cap on the carry depth (dragPlane.rayBoxEntryT). OFF restores the uncapped socket-referenced carry, where a finger dragged across the body of the furniture puts the held part behind it. */
export const CARRY_CAP_ENABLED = true;
/** How far in FRONT of the capping surface the part is carried. Boxes are already fatter than the meshes inside them, so this is not a safety margin against the geometry — it is the visible gap that stops the held part z-fighting the panel it is sliding over. */
export const CARRY_SURFACE_MARGIN_M = 0.02;
/** Per-frame ease for the cap. The raw cap is a STEP function of screen position — crossing a panel's silhouette flips the first surface from that panel to open background in one frame — so taking it outright would pop the part's size at every edge. Faster than DEPTH_BLEND_EASE (~75ms against ~130ms at 60fps) because the failure this eases into is the part vanishing behind geometry, and lag there is lag spent invisible. Tunable in one direction each way: lower if edges pop, higher if the part sinks visibly before catching itself. */
export const CARRY_CAP_EASE = 0.2;
/** How close the easing cap must get to the depth it is releasing toward before it retires to Infinity. An exponential ease never actually arrives, so without a retirement point the cap would hold the part this fraction too near for the rest of the drag. 2mm is under the thickness of anything in these builds. */
export const CARRY_CAP_EPS_M = 0.002;

/** How often the occluder box list is re-read from the renderer DURING a drag. Camera motion alone never stales the list (boxes are world-space; the sightline eye is read per frame) — what does is parts MOVING mid-drag: a second finger toggling cluster focus hides/shows parts, and the previous part's commit animation can still be easing home when the next pickup happens. Both settle within a refresh tick; per-frame reads would be ~2 native calls per placed part per frame for data that changes this rarely. */
export const OCCLUDER_REFRESH_MS = 300;
