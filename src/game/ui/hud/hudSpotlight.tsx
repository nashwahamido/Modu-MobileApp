import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { create } from "zustand";

import { RADIUS, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

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

const BLEED = 6;

const HALO = 5;

export function HudGhostRing({ id, visible }: { id: HudSpotId; visible: boolean }) {
  const styles = useFixedStyles(makeStyles);
  const frame = useHudSpots((s) => s.frames[id]);
  const origin = useLayerOrigin();
  const wash = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const flash = Animated.loop(
      Animated.sequence([
        Animated.timing(wash, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.timing(wash, { toValue: 0, duration: 240, useNativeDriver: true }),
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
          { opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }) },
        ]}
      />
    </Animated.View>
  );
}

export const HUD_GHOST_LAYER: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  zIndex: 57,
};

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

export function useLayerOrigin() {
  return useContext(LayerOrigin);
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    ring: {
      position: "absolute",
      borderRadius: RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
    },
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
    wash: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
  });