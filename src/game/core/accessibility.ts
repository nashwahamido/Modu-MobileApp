// TODO: settle down the part marked as dev-setting:
// 1. moving Ghost vs static ghost
// 2. float vs auto return

// The accessibility settings — types only. Default values and the profiles that override them live in profile.ts.

import { TextLevel } from "@/src/game/core/type";

// =============  Interaction axes ================

// dev-setting
/** Socket preview: "movingGhost" previews the fit on the held part as it approaches; "staticSockets" shows a fixed ghost at every open socket that recolors as the nearest one. */
export type GhostStyle = "movingGhost" | "staticSockets";
/** A part released away from a socket: "autoReturn" sends it back to the tray; "float" leaves it where you set it down (Put-back returns it later). */
export type ReleaseBehavior = "float" | "autoReturn";
/** Lighting rig: "auto" = each render style's natural rig; the rest force a mood. */
export type LightingPreset = "auto" | "studio" | "warm" | "soft" | "golden";
/** Held-part drag mechanism: "adaptive" = this engine's model — screen-space candidate matching + the drag plane eases to the matched socket's height (handles multi-height groups); "level" = the on-release engine's model, kept for comparison/demo — plane FIXED at the session target's height, candidates matched by true 3D distance, so depth can hide a socket (visible on multi-height groups like the wool stool's two-height legs or DALFRED's screw105251). */
export type DragPlane = "adaptive" | "level";

// ===============  The settings =================
export interface AccessibilitySettings {
  textLevel: TextLevel;
  audio: boolean;
  /** Assembly sound effects: taps, screw detents, a part seating, a stage and a build finishing.
   *  Separate from `audio`, which is the spoken instruction clips — a player may want the mallet to
   *  thud without having every step read aloud. */
  soundEffects: boolean;
  /** AMBIENT music — the room, catalogue, profile, shop. Set from the General tab, because it plays
   *  wherever the player is that is not a build. */
  music: boolean;
  /** Ambient music level, 0-1. Separate from the toggle so turning it down is not the same act as
   *  turning it off — a player who wants it quiet under their own audio should not have to choose
   *  between the two. */
  musicVolume: number;
  /** ASSEMBLY music — the build screens only. Its own setting, not a copy of the ambient one: the
   *  build is a long focused task and plenty of players want it silent there and playing elsewhere,
   *  or the reverse. Set from the assembly settings, beside the effects it competes with. */
  buildMusic: boolean;
  /** Assembly music level, 0-1. */
  buildMusicVolume: number;
  /** FREE-mode soft hints when reaching for a not-yet-available part. */
  softHints: boolean;
  /** Player picks the tool from the tool bar before tightening; off = the system equips the right tool automatically. */
  manualTools: boolean;
  /** Show the step instruction text in the top bar; off = only the progress bar. */
  showInstructions: boolean;
  /** Show only the current part + action; hide the rest of the chrome. */
  focusMode: boolean;
  fontScale: number;
  /**
   * Set the READING surfaces in OpenDyslexic — the objective line, hints, the tutorial's messages
   * and the questionnaire.
   *
   * Deliberately not the whole app. Every one of the ~200 style sheets names Lexend as a constant
   * evaluated once at module load, so an app-wide swap means routing all of them through a hook —
   * a large mechanical change to a mechanism that has already broken this app once. These are the
   * places a reader is actually READING rather than glancing at a chip, which is most of the
   * benefit for a fraction of the risk.
   */
  readingFont: boolean;
  
  // dev-setting
  ghostStyle: GhostStyle;
  releaseBehavior: ReleaseBehavior;
  /** Lighting rig mood; "auto" follows the render style. */
  lightingPreset: LightingPreset;
  /** Snap ACCEPTANCE radius in meters — how far from the matched socket a release still counts as placed (and where the magnet reaches full strength). Profiles may raise it for a gentler fit. Consumers clamp to ≤0.2 (below LACK's 0.25m half-spacing). Targeting/hysteresis constants are deliberately NOT settings: they are the anti-jumping machinery and stay fixed. */
  snapDistance: number;
  /** Which surface a held part is dragged on (see DragPlane). */
  dragPlane: DragPlane;
}