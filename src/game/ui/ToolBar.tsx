import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { toolList } from "@/src/game/data/tools";
import { pickThumb } from "@/src/game/core/presentation/labels";
import type { ToolId } from "@/src/game/core/type";

/** Manual tool choice (settings.manualTools): a single toolbox icon under the parts tray. Tapping it expands a horizontal tool tray (leftward); tapping again collapses it. The player equips a tool before a tighten will accept the gesture. Picking a WRONG tool for the active step gives a calm nudge naming the right one — a learning moment, not an error. Hidden entirely in auto mode (the system equips tools silently). */
export function ToolBar({ neededTool }: { neededTool: ToolId | null }) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const furniture = useGameStore((s) => s.furniture);
  const manualTools = useGameStore((s) => s.settings.manualTools);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  if (!manualTools || !furniture) return null;

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

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {needsAttention && !open ? (
        <Text style={styles.prompt}>pick a tool</Text>
      ) : null}
      {open
        ? tools.map((t) => {
            const active = selectedTool === t.id;
            const wanted = neededTool === t.id && !active;
            return (
              <Pressable
                key={t.id}
                onPress={() => pick(t.id)}
                style={[
                  styles.slot,
                  active && styles.slotActive,
                  wanted && styles.slotWanted,
                ]}
                hitSlop={6}
              >
                <Image
                  source={pickThumb(t.icon)}
                  style={styles.icon}
                  resizeMode="contain"
                />
              </Pressable>
            );
          })
        : null}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[
          styles.toggle,
          needsAttention && styles.slotWanted,
          open && styles.toggleOpen,
        ]}
        hitSlop={8}
      >
        <Image
          source={require("../../assets/images/ui/icons/icon-toolBar.png")}
          style={styles.toolboxIcon}
          resizeMode="contain"
        />
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
    // 36 to match the auto button (controlHeightSm), down from 46.
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: t.surface,
    borderWidth: 2,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
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
  },
  // The tool you're holding: ACCENT, not green — it's a live selection, not a
  // completed step.
  slotActive: { borderColor: t.accent, backgroundColor: t.surfaceRaised },
  slotWanted: { borderColor: t.accent },
  icon: { width: 26, height: 26 },
  // The toolbox glyph is flat black artwork, so it takes a tint. This is deliberately a
  // SEPARATE style from `icon`: that one is shared by the tool THUMBNAILS above, which are
  // illustrated images — tinting those would flatten them into purple silhouettes.
  toolboxIcon: { width: 26, height: 26, tintColor: t.accent },
  prompt: { fontSize: 11, fontWeight: "700", color: t.textDim, marginRight: 2 },
  });