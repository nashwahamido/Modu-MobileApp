// One source of truth for how the app clears Android's edge-to-edge system UI. Edge-to-edge is on (app.config.ts edgeToEdgeEnabled), so every screen draws under the cutout and gesture bar and must pad itself back in. In LANDSCAPE — the app's only orientation — the punch-hole and the home-indicator sit on the LEFT and RIGHT, not the top, so left/right insets carry the weight; top/bottom still matter for the status area and the gesture pill.
//
// Why a hook and not inline per screen: the raw insets are 0 on a tablet (Lenovo Tab M10) and real on a notched phone (Galaxy S22 Ultra), so a screen that reads them directly looks fine on the tablet even when it has forgotten an edge — the bug only surfaces on the phone. This hook applies one MINIMUM floor to all four edges so nothing ever hugs the physical glass, even at zero inset, and gives every screen the same numbers. Tune MIN_MARGIN here, once.
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The smallest gap we ever leave between content and the screen edge, in px. Applied even when the device reports a 0 inset (bezelled tablets), so buttons never sit flush to the glass. Raise it if content still feels cramped on real hardware. Screen-level margins for the full-screen surfaces (room, shop, inventory, profile, settings, catalogue, onboarding). Same reasoning as the HUD constants — immersive mode reports 0 insets, so these floors are what actually holds content off the glass — kept as their own pair so a screen can be tuned without moving the in-game HUD. Keep them in step with the HUD values unless there is a reason to diverge.
// NOTE these are ADDED to whatever offset a screen already has (base + max(inset, margin)), so they are small on purpose: the base offsets were already a reasonable inset on a device with no cutout, and this is only the extra clearance immersive mode stops the OS reporting.
export const SCREEN_SIDE_MARGIN = 14;
export const SCREEN_VERTICAL_MARGIN = 6;

// The hook default: every screen that just calls useSafeInsets() lands on the same floor.
export const MIN_MARGIN = SCREEN_SIDE_MARGIN;

export interface SafeInsets {
  // Each edge = max(device inset, MIN_MARGIN) — safe to use directly as padding.
  left: number;
  right: number;
  top: number;
  bottom: number;
  // The raw device insets, for the rare case a screen needs the true value (e.g. adding to an existing pad rather than replacing it). Prefer the floored values above.
  raw: { left: number; right: number; top: number; bottom: number };
}

export function useSafeInsets(min: number = MIN_MARGIN): SafeInsets {
  const i = useSafeAreaInsets();
  return {
    left: Math.max(i.left, min),
    right: Math.max(i.right, min),
    top: Math.max(i.top, min),
    bottom: Math.max(i.bottom, min),
    raw: { left: i.left, right: i.right, top: i.top, bottom: i.bottom },
  };
}

// ── per-axis floors ───────────────────────────────────────────────────────── useSafeInsets above applies ONE floor to all four edges, and that is exactly why thirteen files ignored it and hand-rolled `Math.max(insets.top, SCREEN_VERTICAL_MARGIN)` instead — thirty copies of the expression this file exists to own. Sides and vertical edges have DIFFERENT floors (a cutout sits on the side in landscape; the top only has a status area), so a single `min` could not say what any caller meant. These two hooks can.
//
// Which one: `useScreenInsets` for a full-screen surface or a popup over one. `useHudInsets` for the in-build HUD, whose floors are larger because the app runs immersive there and Android reports 0.

export interface EdgeInsets extends SafeInsets {
  /**
   * The larger of left and right, floored. For a CENTRED panel that has to inset symmetrically: using
   * left on one side and right on the other would sit it off-centre on a phone with one-sided insets.
   */
  side: number;
}

function edges(
  i: { left: number; right: number; top: number; bottom: number },
  sideFloor: number,
  verticalFloor: number,
): EdgeInsets {
  const left = Math.max(i.left, sideFloor);
  const right = Math.max(i.right, sideFloor);
  return {
    left,
    right,
    top: Math.max(i.top, verticalFloor),
    bottom: Math.max(i.bottom, verticalFloor),
    side: Math.max(left, right),
    raw: { left: i.left, right: i.right, top: i.top, bottom: i.bottom },
  };
}

/** Floors for a full-screen surface: the room, a popup over it, profile, settings, the catalogue. */
export function useScreenInsets(): EdgeInsets {
  return edges(useSafeAreaInsets(), SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN);
}

/** Floors for the in-build HUD, which runs immersive and cannot rely on the reported inset at all. */
export function useHudInsets(): EdgeInsets {
  return edges(useSafeAreaInsets(), HUD_SIDE_MARGIN, HUD_VERTICAL_MARGIN);
}

// The side margin the in-game HUD uses. The app runs immersive (status + navigation bars hidden), and Android reports 0 insets in that state even on a phone whose display cutout is still physically present — so this floor, not the inset, is what actually keeps the HUD off the camera hole and the gesture area in landscape. Sized to clear a Galaxy S22-class cutout. THIS IS THE KNOB: raise it if the HUD still sits under the cutout, lower it if the controls float too far in on a bezelled tablet.
export const HUD_SIDE_MARGIN = 20;

// Top and bottom floor for the in-game HUD. Two things stack here: immersive mode reports 0 vertical inset, AND hiding the status bar grows the window upward after mount, so anything that looked fine on the first frame slides up to the physical edge a moment later. The margin therefore has to stand on its own — there is no system bar left to sit under.
export const HUD_VERTICAL_MARGIN = 15;