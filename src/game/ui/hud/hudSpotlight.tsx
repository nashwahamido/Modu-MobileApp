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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { create } from "zustand";

import { RADIUS, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/** The controls a coach can point at. Add an id here and wrap the control in HudSpotTarget. */
export type HudSpotId = "auto" | "spot" | "recenter" | "map";

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

/** How far the halo stands proud of the control, beyond BLEED. Small enough to read as the button's
 *  own glow rather than a second shape floating near it. */
const HALO = 5;

/**
 * A pulsing ring around a registered control.
 *
 * Renders nothing until the control has been measured, so a coach whose target is off screen — Auto
 * in a release build, Recenter in focus mode — simply shows no ring rather than one at the origin.
 */
export function HudGhostRing({ id, visible }: { id: HudSpotId; visible: boolean }) {
  const styles = useFixedStyles(makeStyles);
  const frame = useHudSpots((s) => s.frames[id]);
  const origin = useLayerOrigin();
  // 0 → 1 across one flash. Drives opacity only, so it stays on the native driver.
  const wash = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    // THE PARTS TRAY'S FLASH, not the tutorial's breath.
    //
    // The tray already had a way of saying "this one" — a wash of the accent over the card, pulsed
    // three times at 240ms — and a player meets it the first time they press Spot. Reusing it here
    // means the coaches point with the same gesture the tray points with, instead of teaching a
    // second vocabulary for the same idea.
    //
    // It loops rather than stopping at three, because these rings stay up as long as the card that
    // owns them: the tray's flash answers a button press and is done, while a coach is waiting for
    // the player to act, and a highlight that finishes before they look has pointed at nothing.
    const flash = Animated.loop(
      Animated.sequence([
        Animated.timing(wash, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.timing(wash, { toValue: 0, duration: 240, useNativeDriver: true }),
        // A beat between pulses, so it reads as a tap on the shoulder rather than a strobe.
        Animated.delay(520),
      ]),
    );
    flash.start();
    return () => {
      flash.stop();
      wash.setValue(0);
    };
  }, [visible, wash, fade]);

  if (!visible || !frame) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: frame.x - origin.x - BLEED,
          top: frame.y - origin.y - BLEED,
          width: frame.width + BLEED * 2,
          height: frame.height + BLEED * 2,
          opacity: fade,
        },
      ]}
    >
      {/* TWO LAYERS, because one colour cannot highlight every button.
          The wash alone works on the cream chips — Recenter, Auto, Spot — but the Map button is
          itself lavender, so an accent wash over it is accent over accent and all but invisible.
          The halo sits OUTSIDE the control, on the teal backdrop, where the accent always contrasts;
          the wash brightens the face of a pale control. Together they read on both. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          { opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.wash,
          // Up from 0.5: at half opacity the pulse was easy to miss on a busy HUD, and this is the
          // app asking for a specific press rather than decorating a card.
          { opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }) },
        ]}
      />
    </Animated.View>
  );
}

/** The layer a ring must be rendered into: full screen, outside the inset HUD chrome. */
export const HUD_GHOST_LAYER: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  zIndex: 57,
};

/**
 * Where the ring layer's own top-left sits in WINDOW coordinates.
 *
 * THIS IS WHY A HIGHLIGHT CAN LAND OFF ITS BUTTON. Controls report themselves with
 * `measureInWindow`, which is measured from the window's top-left, but a ring is positioned inside
 * some View — and that View's top-left is only the same point if nothing above it is inset. Any
 * difference becomes a constant offset in one direction, which is exactly what a shifted halo looks
 * like.
 *
 * It bit two identical S22s differently because it is not a hardware difference: Samsung's per-app
 * "Full screen apps" setting decides whether the app window starts at the display edge or beside the
 * camera cutout, so the same build gets a different window origin on each phone. Anything read off
 * the safe-area insets has the same problem — the app runs immersive, and Android reports zero
 * insets once the bars are hidden even though the cutout is still physically there.
 *
 * So the layer measures ITSELF and rings subtract it. Both numbers then come from the same API and
 * the same frame of reference, and the offset cancels whatever the window is doing.
 */
const LayerOrigin = createContext<{ x: number; y: number }>({ x: 0, y: 0 });

export function HudGhostLayer({ children }: { children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const measure = () => {
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y) => {
        setOrigin((was) =>
          Math.abs(was.x - x) < 0.5 && Math.abs(was.y - y) < 0.5 ? was : { x, y },
        );
      });
    });
  };

  return (
    <View
      ref={ref}
      style={HUD_GHOST_LAYER}
      pointerEvents="none"
      onLayout={measure}
      collapsable={false}
    >
      <LayerOrigin.Provider value={origin}>{children}</LayerOrigin.Provider>
    </View>
  );
}

/** The offset a ring must subtract from a window-measured frame to land in its own layer. */
export function useLayerOrigin() {
  return useContext(LayerOrigin);
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // NO BORDER any more. The outline and the wash together read as two separate signals stacked on
    // one button; the wash alone is what the parts tray uses, and it is enough.
    // NO overflow:hidden — the halo has to draw OUTSIDE these bounds.
    ring: {
      position: "absolute",
      borderRadius: RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    // The glow around the control. Inset negatively so it stands proud on every side.
    halo: {
      position: "absolute",
      left: -HALO,
      right: -HALO,
      top: -HALO,
      bottom: -HALO,
      borderRadius: RADIUS.pill,
      borderWidth: 3,
      borderColor: t.accent,
    },
    // Matches PartsTray.flashOverlay: the accent at half opacity over the whole control.
    wash: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
  });