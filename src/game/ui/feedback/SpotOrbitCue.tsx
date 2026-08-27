// "Turn the model" — shown while Spot is running but its target is not on screen.
//
// Spot plays a ghost of the next part travelling into its socket. That is only useful if the socket
// is in view; if the player has orbited to the far side, Spot appears to do nothing at all, and the
// obvious conclusion is that the button is broken rather than that the answer is behind the model.
//
// WHAT THIS CAN AND CANNOT SEE: the socket is projected to screen coordinates, so "off screen" and
// "behind the camera" are known exactly. Being OCCLUDED — the ghost is in frame but hidden behind the
// tabletop — is not detected: that needs depth testing or per-part bounds, and the pure data carries
// neither. The common case after orbiting is the far side, which this does catch.
//
// TURNED OFF (see ENABLED): in play the chip cost more than it paid — it read as a nag on a view the
// player had chosen, and the strict edge test fired on sockets that were still perfectly findable.
// The code stays because the question it answers is real; the flag below is the only switch.
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
import { projectToScreen, type LookAt } from "@/src/game/scene/projectToScreen";
import { ELEVATION, FONT, RADIUS, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { Vec3 } from "@/src/game/core/type";
import { useMirror } from "@/src/game/ui/system/handedness";

/** The whole cue. Off: turn it on here and nowhere else. */
const ENABLED = false;
/** Re-checked at ~10fps, not per frame: this answers a yes/no question that only changes when the
 *  camera moves a long way, and the cue itself has to be stable enough to read. */
const CHECK_MS = 100;
/** How far PAST the edge the socket has to be before the cue counts it as lost. Negative on purpose:
 *  the pad used to be +56, which called a socket off screen while it was still in frame. A ghost a
 *  little outside the viewport is usually found by the part travelling INTO it, so only a socket well
 *  past the edge — or behind the camera, which projects to null — is worth a chip. */
const EDGE_PAD = -140;
/** The socket has to stay lost this long before the chip appears. A turn sweeps the socket off and
 *  back again; without this the cue flashes during the very gesture it is asking for. */
const SETTLE_MS = 1200;

export function SpotOrbitCue({
  manipulator,
}: {
  manipulator: { getLookAt: () => LookAt | null } | null | undefined;
}) {
  const m = useMirror();
  const styles = useFixedStyles(makeStyles);
  const hintPartId = useGameStore((s) => s.hintPartId);
  const parts = useGameStore((s) => s.furniture?.parts);
  const { width: winW, height: winH } = useWindowDimensions();
  const [offScreen, setOffScreen] = useState(false);

  useEffect(() => {
    if (!ENABLED || !hintPartId || !parts || !manipulator) {
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
    // How long the socket has been lost, counted in checks rather than by clock: the interval is the
    // only thing that advances it, so a paused screen cannot age the cue in.
    let lostMs = 0;
    const check = () => {
      const sp = projectToScreen(manipulator.getLookAt(), world, winW, winH);
      const lost =
        !sp ||
        sp.x < EDGE_PAD ||
        sp.x > winW - EDGE_PAD ||
        sp.y < EDGE_PAD ||
        sp.y > winH - EDGE_PAD;
      lostMs = lost ? lostMs + CHECK_MS : 0;
      setOffScreen(lostMs >= SETTLE_MS);
    };
    check();
    const id = setInterval(check, CHECK_MS);
    return () => clearInterval(id);
  }, [hintPartId, manipulator, parts, winH, winW]);

  // A joystick that rocks left and right — the gesture being asked for, rather than a word for it.
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
    // Above the joystick, because the joystick is the answer. A cue about a control belongs beside
    // that control, not in the middle of the scene it is asking the player to move.
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