import {
  useEffect,
  useState } from "react";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useGameStore } from "@/src/game/core/store";
import { ELEVATION, RADIUS, SPACE, Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { toolList } from "@/src/game/content/tools";
import { pickThumb } from "@/src/game/core/presentation/labels";
import type { ToolId } from "@/src/game/core/type";

export function ToolBar({
  neededTool,
  forceVisible = false,
}: {
  neededTool: ToolId | null;
  forceVisible?: boolean;
}) {
  const styles = useFixedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const furniture = useGameStore((s) => s.furniture);
  const manualTools = useGameStore((s) => s.settings.manualTools);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const hintTool = useGameStore((s) => s.hintTool);
  const hintPulse = useGameStore((s) => s.hintPulse);
  const toolsIcon = useHudIcon("tools");
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!hintTool) return;
    flash.value = 0;
    flash.value = withRepeat(
      withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 240 })),
      3,
    );
  }, [hintTool, hintPulse, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));
  if ((!manualTools && !forceVisible) || !furniture) return null;

  const tools = toolList(furniture);
  if (!tools.length) return null;

  const pick = (id: ToolId) => {
    setSelectedTool(selectedTool === id ? null : id);
    if (neededTool && id !== neededTool && selectedTool !== id) {
      const right = tools.find((t) => t.id === neededTool)?.label ?? neededTool;
      const picked = tools.find((t) => t.id === id)?.label ?? id;
      useGameStore.setState({
        hint: `That's the ${picked.toLowerCase()} — this step needs the ${right.toLowerCase()}.`,
      });
    }
  };

  const needsAttention = !!neededTool && selectedTool !== neededTool;

  const flashToolbox = !!hintTool && !open;
  const flashSlot = (id: ToolId): boolean => !!hintTool && open && hintTool === id;

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {needsAttention && !open ? (
        <Text style={styles.prompt}>Pick a Tool</Text>
      ) : null}
      {open
        ? tools.map((t) => {
            const active = selectedTool === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => pick(t.id)}
                style={[styles.slot, active && styles.slotActive]}
                hitSlop={6}
              >
                <GrainOverlay radius={12} />
                <Image
                  source={pickThumb(t.icon)}
                  style={styles.icon}
                  resizeMode="contain"
                />
                {flashSlot(t.id) ? (
                  <Animated.View pointerEvents="none" style={[styles.flashOverlay, flashStyle]} />
                ) : null}
              </Pressable>
            );
          })
        : null}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          styles.toggle,
          needsAttention && styles.slotWanted,
          open && styles.toggleOpen,
          pressed && { opacity: 0.6 },
        ]}
        hitSlop={8}
      >
        <GrainOverlay radius={RADIUS.control} />
        <Image
          source={toolsIcon}
          style={styles.toolboxIcon}
          resizeMode="contain"
        />
        {flashToolbox ? (
          <Animated.View pointerEvents="none" style={[styles.flashOverlaySlot, flashStyle]} />
        ) : null}
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  bar: {
    position: "absolute",
    alignSelf: "center",
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    backgroundColor: t.surface,
    borderColor: t.border,
    ...ELEVATION.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  toggleOpen: { backgroundColor: t.surfaceRaised },
  slot: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: t.surface,
    borderWidth: 2,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotActive: { borderColor: t.accent, backgroundColor: t.surfaceRaised },
  slotWanted: { borderColor: t.accent },
  icon: { width: 26, height: 26 },
  toolboxIcon: { width: 24, height: 24 },
  prompt: {
    fontSize: 12,
    fontWeight: "800",
    color: t.onAccent,
    backgroundColor: t.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
    marginRight: SPACE.xs,
    overflow: "hidden",
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: t.accent,
  },
  flashOverlaySlot: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.control,
    backgroundColor: t.accent,
  },
  });