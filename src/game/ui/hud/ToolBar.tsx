import { useEffect, useState } from "react";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
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

/** Manual tool choice (settings.manualTools): a single toolbox icon under the parts tray. Tapping it expands a horizontal tool tray (leftward); tapping again collapses it. The player equips a tool before a tighten will accept the gesture. Picking a WRONG tool for the active step gives a calm nudge naming the right one — a learning moment, not an error. Hidden entirely in auto mode (the system equips tools silently). */
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
  // Read with the other hooks, ABOVE the early returns below: this component bails out when manual
  // tools are off or the build has none, so a hook called down at the icon would run on some
  // renders and not others.
  const toolsIcon = useHudIcon("tools");
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!hintTool) return;
    // Three gentle accent pulses, the same treatment the parts tray uses — the point is that "which tool" and "which part" speak one visual language.
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

  // Closed, the toolbox is the most specific TRUE thing to point at — the tray cannot show a tool it is not displaying. Open, pointing at the toolbox again would name a container the player has already opened, so the specific slot takes over.
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
              // The accent border means EQUIPPED and nothing else. An unselected tool wearing it too — which is what the old "wanted" state did to whichever tool the step needed — made the row read as two things being on at once, and the player could not tell the choice they had made from the choice being suggested. Pointing at the right tool is now the "?" flash's job (transient, asked for) and the "Pick a Tool" prompt's (persistent, unasked).
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
    // Bottom-centre: bottom-right belongs to the toggles row, bottom-left to the joystick, and the right edge above is the parts tray.
    position: "absolute",
    alignSelf: "center",
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggle: {
    // Chip container matching the HUD icon buttons: surface fill, border, clay grain, shadow.
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
  // Open swaps the fill to the raised surface, echoing a pressed/active chip.
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
  // The tool you're holding: ACCENT, not green — it's a live selection, not a completed step.
  slotActive: { borderColor: t.accent, backgroundColor: t.surfaceRaised },
  slotWanted: { borderColor: t.accent },
  icon: { width: 26, height: 26 },
  toolboxIcon: { width: 24, height: 24 },
  // On its own ACCENT pill rather than as loose text: this prompt floats over the 3D scene, where a
  // dim ink line disappeared against a light backdrop and a light one would vanish against a dark
  // model. Light ink on the accent reads in both, and it is the same "act on this" colour the
  // toolbox coach uses for the same instruction.
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
  // The ? hint pulse on a tool slot: matches PartsTray's flashOverlay, radius 12 to match `slot`.
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: t.accent,
  },
  // Same pulse, but for the toolbox toggle — its own radius, RADIUS.control, differs from the slot's.
  flashOverlaySlot: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.control,
    backgroundColor: t.accent,
  },
  });