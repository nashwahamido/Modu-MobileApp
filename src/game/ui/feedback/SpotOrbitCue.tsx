import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useGameStore } from "@/src/game/core/store";
import { projectToScreen, type GetLookAt } from "@/src/game/scene/projectToScreen";
import { ELEVATION, FONT, RADIUS, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { Vec3 } from "@/src/game/core/type";
import { useMirror } from "@/src/game/ui/system/handedness";

const CHECK_MS = 100;
const EDGE_PAD = 56;

export function SpotOrbitCue({
  getLookAt,
}: {
  getLookAt: GetLookAt;
}) {
  const m = useMirror();
  const styles = useFixedStyles(makeStyles);
  const hintPartId = useGameStore((s) => s.hintPartId);
  const parts = useGameStore((s) => s.furniture?.parts);
  const { width: winW, height: winH } = useWindowDimensions();
  const [offScreen, setOffScreen] = useState(false);

  useEffect(() => {
    if (!hintPartId || !parts) {
      setOffScreen(false);
      return;
    }
    const part = parts[hintPartId];
    if (!part) {
      setOffScreen(false);
      return;
    }
    const off = part.visualCenterOffset ?? [0, 0, 0];
    const world: Vec3 = [
      part.pose.position[0] + off[0],
      part.pose.position[1] + off[1],
      part.pose.position[2] + off[2],
    ];
    const check = () => {
      const sp = projectToScreen(getLookAt(), world, winW, winH);
      setOffScreen(
        !sp ||
          sp.x < EDGE_PAD ||
          sp.x > winW - EDGE_PAD ||
          sp.y < EDGE_PAD ||
          sp.y > winH - EDGE_PAD,
      );
    };
    check();
    const id = setInterval(check, CHECK_MS);
    return () => clearInterval(id);
  }, [hintPartId, getLookAt, parts, winH, winW]);

  const rock = useSharedValue(0);
  useEffect(() => {
    if (!offScreen) return;
    rock.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 1040, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [offScreen, rock]);
  const rockStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rock.value * 9 }],
  }));

  if (!offScreen) return null;
  return (
    <View style={m(styles.wrap)} pointerEvents="none">
      <Animated.View style={rockStyle}>
        <Image
          source={require("@/src/assets/ui/icons/icon-focus.png")}
          style={styles.icon}
          resizeMode="contain"
        />
      </Animated.View>
      <Text style={styles.text}>Turn the model to find the spot</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      left: 24,
      bottom: 226,
      maxWidth: 210,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
      borderWidth: 2,
      borderColor: t.accent,
      ...ELEVATION.card,
    },
    icon: { width: 22, height: 22 },
    text: {
      flex: 1,
      color: t.text,
      fontFamily: FONT,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 15,
    },
  });