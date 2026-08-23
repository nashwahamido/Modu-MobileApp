// Ghost highlights for HUD controls a coach is pointing at.
//
// MEASURED, NOT DECLARED. The obvious way to ring a button is to copy its slot — right:14, top:8,
// 86 wide — into the ring's style, and that is what MapCoach's own ring does today. It works there
// because the Map button has a fixed slot. It does NOT work for Auto, Spot or anything else in the
// toggles row: that row is right-anchored with a gap, so every chip's x depends on the widths of the
// chips beside it, and Auto has no fixed width at all (it is content-sized around its label). A
// copied number would drift the moment a chip appeared, changed label, or the row was mirrored for a
// left-handed player.
//
// So the control registers where it actually IS, and the ring draws there.
//
// WINDOW COORDINATES throughout. `measureInWindow` is the only measurement that survives being read
// from a different part of the tree — which is the whole point, since the ring renders in a
// full-screen layer while the button lives inside the inset HUD chrome. It also means a ring must be
// rendered in a full-screen layer, NOT inside `chrome`: inside it, every frame would be off by the
// safe-area inset.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { create } from "zustand";

import { RADIUS, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/** The controls a coach can point at. Add an id here and wrap the control in HudSpotTarget. */
export type HudSpotId = "auto" | "spot" | "recenter";

export interface HudSpotFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HudSpotState {
  frames: Partial<Record<HudSpotId, HudSpotFrame>>;
  setFrame: (id: HudSpotId, frame: HudSpotFrame) => void;
  clearFrame: (id: HudSpotId) => void;
}

export const useHudSpots = create<HudSpotState>()((set) => ({
  frames: {},
  // Sub-pixel churn is ignored, the same guard the tutorial's own targetRegistry uses: layout fires
  // constantly during a drag, and writing a frame that has not really moved re-renders every ring on
  // screen for nothing.
  setFrame: (id, frame) =>
    set((state) => {
      const previous = state.frames[id];
      if (
        previous &&
        Math.abs(previous.x - frame.x) < 0.5 &&
        Math.abs(previous.y - frame.y) < 0.5 &&
        Math.abs(previous.width - frame.width) < 0.5 &&
        Math.abs(previous.height - frame.height) < 0.5
      ) {
        return state;
      }
      return { frames: { ...state.frames, [id]: frame } };
    }),
  clearFrame: (id) =>
    set((state) => {
      const frames = { ...state.frames };
      delete frames[id];
      return { frames };
    }),
}));

/**
 * Wraps a HUD control and reports where it lands.
 *
 * `pointerEvents: box-none` so the wrapper is invisible to touch and the control underneath behaves
 * exactly as it did unwrapped. Pass the control's slot style HERE rather than to the control when the
 * control positions itself absolutely — a zero-size wrapper would become the reference frame for its
 * absolute child and move it to the corner.
 */
export function HudSpotTarget({
  id,
  style,
  children,
}: {
  id: HudSpotId;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const ref = useRef<View>(null);
  const setFrame = useHudSpots((s) => s.setFrame);
  const clearFrame = useHudSpots((s) => s.clearFrame);

  const measure = () => {
    // A frame after layout but before the next paint reads as 0x0 on Android, so the measurement is
    // deferred by one frame — the same requestAnimationFrame the tutorial's TutorialTarget uses.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) setFrame(id, { x, y, width, height });
      });
    });
  };

  useEffect(() => {
    measure();
    return () => clearFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <View ref={ref} style={style} pointerEvents="box-none" onLayout={measure} collapsable={false}>
      {children}
    </View>
  );
}

/** How far the ring stands proud of the control on every side. */
const BLEED = 6;

/**
 * A pulsing ring around a registered control.
 *
 * Renders nothing until the control has been measured, so a coach whose target is off screen — Auto
 * in a release build, Recenter in focus mode — simply shows no ring rather than one at the origin.
 */
export function HudGhostRing({ id, visible }: { id: HudSpotId; visible: boolean }) {
  const styles = useFixedStyles(makeStyles);
  const frame = useHudSpots((s) => s.frames[id]);
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    // The tutorial's breath, so a ring in the build reads as the same voice as a ring in the guide.
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    breath.start();
    return () => {
      breath.stop();
      pulse.setValue(1);
    };
  }, [visible, pulse, fade]);

  if (!visible || !frame) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: frame.x - BLEED,
          top: frame.y - BLEED,
          width: frame.width + BLEED * 2,
          height: frame.height + BLEED * 2,
          opacity: fade,
          transform: [{ scale: pulse }],
        },
      ]}
    />
  );
}

/** The layer a ring must be rendered into: full screen, outside the inset HUD chrome. */
export const HUD_GHOST_LAYER: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  zIndex: 57,
};

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    ring: {
      position: "absolute",
      borderRadius: RADIUS.pill,
      borderWidth: 3,
      // The app's one interactive accent — the ring means "press this".
      borderColor: t.accent,
    },
  });