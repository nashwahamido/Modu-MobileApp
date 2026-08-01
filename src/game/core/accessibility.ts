// TODO: settle down the part marked as dev-setting: 
// 1. magnetic vs onRelease
// 2. moving Ghost vs static ghost
// 3. float vs auto return

// The accessibility settings — types only. Default values and the profiles that override them live in profile.ts.

import { TextLevel } from "@/src/game/core/type";

// =============  Interaction axes ================

// dev-setting
/** How a held part snaps to a socket: "magnetic" eases it in during the drag; "onRelease" keeps it under the finger and animates it home on release. */
export type SnapStyle = "magnetic" | "onRelease";
/** Socket preview: "movingGhost" previews the fit on the held part as it approaches; "staticSockets" shows a fixed ghost at every open socket that recolors as the nearest one. */
export type GhostStyle = "movingGhost" | "staticSockets";
/** A part released away from a socket: "autoReturn" sends it back to the tray; "float" leaves it where you set it down (Put-back returns it later). */
export type ReleaseBehavior = "float" | "autoReturn";
/** Lighting rig: "auto" = each render style's natural rig; the rest force a mood. */
export type LightingPreset = "auto" | "studio" | "warm" | "soft" | "golden";
/** Held-part drag mechanism: "adaptive" = this engine's model — screen-space candidate matching + the drag plane eases to the matched socket's height (handles multi-height groups); "level" = the on-release engine's model, kept for comparison/demo — plane FIXED at the session target's height, candidates matched by true 3D distance, so depth can hide a socket (visible on multi-height groups like the wool stool's two-height legs or DALFRED's screw105251). */
export type DragPlane = "adaptive" | "level";
/** Control companion's tutorial presentation preset. Individual support toggles may override parts of it. */
export type ControlGuidanceLevel = "minimal" | "balanced" | "detailed";

// ===============  The settings =================
export interface AccessibilitySettings {
  textLevel: TextLevel;
  audio: boolean;
  /** FREE-mode soft hints when reaching for a not-yet-available part. */
  softHints: boolean;
  /** Player picks the tool from the tool bar before tightening; off = the system equips the right tool automatically. */
  manualTools: boolean;
  /** Show the step instruction text in the top bar; off = only the progress bar. */
  showInstructions: boolean;
  /** Show only the current part + action; hide the rest of the chrome. */
  focusMode: boolean;
  /** Show non-essential HUD such as progress, XP, undo, and fit feedback. */
  showUiOverlay: boolean;
  /** Base presentation preset for the adjustable Control companion. */
  controlGuidanceLevel: ControlGuidanceLevel;
  /** Auto-orient the camera to frame the next open target socket. */
  autoView: boolean;
  fontScale: number;
  
  // dev-setting
  snapStyle: SnapStyle;
  ghostStyle: GhostStyle;
  releaseBehavior: ReleaseBehavior;
  /** Lighting rig mood; "auto" follows the render style. */
  lightingPreset: LightingPreset;
  /** Snap ACCEPTANCE radius in meters — how far from the matched socket a release still counts as placed (and where the magnet reaches full strength). Profiles may raise it for a gentler fit. Consumers clamp to ≤0.2 (below LACK's 0.25m half-spacing). Targeting/hysteresis constants are deliberately NOT settings: they are the anti-jumping machinery and stay fixed. */
  snapDistance: number;
  /** Which surface a held part is dragged on (see DragPlane). */
  dragPlane: DragPlane;
}
